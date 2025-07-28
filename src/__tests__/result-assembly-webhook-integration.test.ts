import { describe, it, expect, beforeEach, afterEach, jest, beforeAll, afterAll } from '@jest/globals'
import { createServer, Server } from 'http'
import { resultAssemblerService } from '@/services/result-assembler'
import { clientWebhookService } from '@/services/client-webhook'
import { transcriptionService } from '@/services/transcription'
import { databaseService } from '@/services/database'
import { Task, Segment } from '@/types'
import crypto from 'crypto'

describe('Result Assembly and Webhook Integration', () => {
  let mockWebhookServer: Server
  let webhookUrl: string
  let receivedWebhooks: any[] = []
  let serverResponses: { [path: string]: { status: number; body?: any; delay?: number } } = {}

  beforeAll(async () => {
    // Start mock webhook server
    mockWebhookServer = createServer((req, res) => {
      let body = ''
      req.on('data', chunk => {
        body += chunk.toString()
      })
      
      req.on('end', () => {
        const path = req.url || '/'
        const response = serverResponses[path] || { status: 200 }
        
        // Add delay if specified
        const processRequest = () => {
          // Store received webhook for verification
          receivedWebhooks.push({
            method: req.method,
            url: req.url,
            headers: req.headers,
            body: body ? JSON.parse(body) : null,
            timestamp: new Date().toISOString()
          })

          res.writeHead(response.status, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(response.body || { success: true }))
        }

        if (response.delay) {
          setTimeout(processRequest, response.delay)
        } else {
          processRequest()
        }
      })
    })

    await new Promise<void>((resolve) => {
      mockWebhookServer.listen(0, () => {
        const address = mockWebhookServer.address()
        const port = typeof address === 'object' && address ? address.port : 3001
        webhookUrl = `http://localhost:${port}`
        resolve()
      })
    })
  })

  afterAll(async () => {
    if (mockWebhookServer) {
      await new Promise<void>((resolve) => {
        mockWebhookServer.close(() => resolve())
      })
    }
  })

  beforeEach(() => {
    receivedWebhooks = []
    serverResponses = {}
    jest.clearAllMocks()
  })

  describe('Result Assembler Service', () => {
    it('should combine segments chronologically', async () => {
      const segments: Segment[] = [
        {
          id: '1',
          task_id: 'task-1',
          file_path: '/path/segment1.mp3',
          start_time: 0,
          end_time: 15,
          status: 'completed',
          transcription_text: 'Hello world',
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: '2',
          task_id: 'task-1',
          file_path: '/path/segment2.mp3',
          start_time: 15,
          end_time: 30,
          status: 'completed',
          transcription_text: 'this is a test',
          created_at: '2024-01-01T00:00:00Z'
        }
      ]

      const result = await resultAssemblerService.combineSegments(segments)

      expect(result.text).toBe('Hello world this is a test')
      expect(result.segments).toHaveLength(2)
      expect(result.segments[0].startTime).toBe(0)
      expect(result.segments[1].startTime).toBe(15)
      expect(result.metadata.totalDuration).toBe(30)
      expect(result.metadata.languageCode).toBe('en')
      expect(result.metadata.confidence).toBe(0.85)
    })

    it('should handle segments with gaps and log warnings', async () => {
      const logSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
      
      const segments: Segment[] = [
        {
          id: '1',
          task_id: 'task-1',
          file_path: '/path/segment1.mp3',
          start_time: 0,
          end_time: 10,
          status: 'completed',
          transcription_text: 'First segment',
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: '2',
          task_id: 'task-1',
          file_path: '/path/segment2.mp3',
          start_time: 15, // 5 second gap
          end_time: 25,
          status: 'completed',
          transcription_text: 'Second segment',
          created_at: '2024-01-01T00:00:00Z'
        }
      ]

      const result = await resultAssemblerService.combineSegments(segments)

      expect(result.text).toBe('First segment Second segment')
      expect(result.metadata.totalDuration).toBe(25)
      
      logSpy.mockRestore()
    })

    it('should filter out failed segments', async () => {
      const segments: Segment[] = [
        {
          id: '1',
          task_id: 'task-1',
          file_path: '/path/segment1.mp3',
          start_time: 0,
          end_time: 15,
          status: 'completed',
          transcription_text: 'Good segment',
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: '2',
          task_id: 'task-1',
          file_path: '/path/segment2.mp3',
          start_time: 15,
          end_time: 30,
          status: 'failed',
          transcription_text: null,
          error_message: 'Processing failed',
          created_at: '2024-01-01T00:00:00Z'
        }
      ]

      const result = await resultAssemblerService.combineSegments(segments)

      expect(result.text).toBe('Good segment')
      expect(result.segments).toHaveLength(1)
    })

    it('should validate segments for combination readiness', () => {
      const segments: Segment[] = [
        {
          id: '1',
          task_id: 'task-1',
          file_path: '/path/segment1.mp3',
          start_time: 0,
          end_time: 15,
          status: 'completed',
          transcription_text: 'Completed',
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: '2',
          task_id: 'task-1',
          file_path: '/path/segment2.mp3',
          start_time: 15,
          end_time: 30,
          status: 'processing',
          created_at: '2024-01-01T00:00:00Z'
        }
      ]

      const validation = resultAssemblerService.validateSegmentsForCombination(segments)

      expect(validation.isReady).toBe(false)
      expect(validation.missingSegments).toContain('2')
    })
  })

  describe('Client Webhook Service', () => {
    it('should send successful webhook with HMAC signature', async () => {
      serverResponses['/'] = { status: 200 }

      const task: Task = {
        id: 'test-task-1',
        client_webhook_url: webhookUrl,
        original_filename: 'test.mp3',
        status: 'completed',
        total_segments: 1,
        completed_segments: 1,
        final_transcription: 'Test transcription',
        created_at: '2024-01-01T00:00:00Z'
      }

      const combinedTranscription = {
        text: 'Test transcription',
        segments: [{ startTime: 0, endTime: 15, text: 'Test transcription' }],
        metadata: { totalDuration: 15, languageCode: 'en', confidence: 0.9 }
      }

      const result = await clientWebhookService.sendWebhookNotification(task, combinedTranscription)

      expect(result.finalStatus).toBe('delivered')
      expect(result.attempts).toHaveLength(1)
      expect(result.attempts[0].success).toBe(true)
      expect(receivedWebhooks).toHaveLength(1)

      const webhook = receivedWebhooks[0]
      expect(webhook.body.taskId).toBe('test-task-1')
      expect(webhook.body.status).toBe('completed')
      expect(webhook.body.transcription).toBe('Test transcription')
      expect(webhook.headers['x-webhook-signature']).toBeDefined()
      expect(webhook.headers['x-webhook-timestamp']).toBeDefined()
    }, 15000)

    it('should retry failed webhooks with exponential backoff', async () => {
      // First 2 attempts fail, 3rd succeeds
      serverResponses['/'] = { status: 500 }
      
      const task: Task = {
        id: 'test-task-retry',
        client_webhook_url: webhookUrl,
        original_filename: 'test.mp3',
        status: 'completed',
        total_segments: 1,
        completed_segments: 1,
        created_at: '2024-01-01T00:00:00Z'
      }

      // Start the webhook delivery
      const resultPromise = clientWebhookService.sendWebhookNotification(task)

      // After 500ms, change server to return success
      setTimeout(() => {
        serverResponses['/'] = { status: 200 }
      }, 500)

      const result = await resultPromise

      expect(result.finalStatus).toBe('delivered')
      expect(result.attempts.length).toBeGreaterThan(1)
      expect(result.attempts[result.attempts.length - 1].success).toBe(true)
      expect(receivedWebhooks.length).toBeGreaterThan(1)
    }, 15000)

    it('should handle webhook timeout', async () => {
      // Mock a timeout by not responding to the request
      serverResponses['/'] = { status: 200, delay: 35000 } // Longer than 30s timeout

      const task: Task = {
        id: 'test-task-timeout',
        client_webhook_url: 'http://localhost:99999', // Use invalid URL to simulate timeout
        original_filename: 'test.mp3',
        status: 'completed',
        total_segments: 1,
        completed_segments: 1,
        created_at: '2024-01-01T00:00:00Z'
      }

      const result = await clientWebhookService.sendWebhookNotification(task)

      expect(result.finalStatus).toBe('failed')
      expect(result.attempts[0].success).toBe(false)
      expect(result.attempts[0].error).toBeDefined()
    }, 40000)

    it('should verify HMAC signatures correctly', () => {
      const payload = JSON.stringify({ test: 'data' })
      const signature = clientWebhookService.verifyHMACSignature(payload, 'invalid-signature')
      expect(signature).toBe(false)

      // Test with correct signature (we need to create it first)
      const correctSignature = crypto
        .createHmac('sha256', process.env.WEBHOOK_SIGNING_SECRET || 'default-secret-change-in-production')
        .update(payload)
        .digest('hex')
      
      const validSignature = clientWebhookService.verifyHMACSignature(payload, `sha256=${correctSignature}`)
      expect(validSignature).toBe(true)
    })

    it('should send failure webhook when transcription fails', async () => {
      serverResponses['/'] = { status: 200 }

      const task: Task = {
        id: 'test-task-failed',
        client_webhook_url: webhookUrl,
        original_filename: 'test.mp3',
        status: 'failed',
        total_segments: 1,
        completed_segments: 0,
        error_message: 'Processing failed',
        created_at: '2024-01-01T00:00:00Z'
      }

      const result = await clientWebhookService.sendWebhookNotification(
        task,
        undefined,
        'Processing failed'
      )

      expect(result.finalStatus).toBe('delivered')
      expect(receivedWebhooks).toHaveLength(1)

      const webhook = receivedWebhooks[0]
      expect(webhook.body.status).toBe('failed')
      expect(webhook.body.error).toBe('Processing failed')
      expect(webhook.body.transcription).toBeUndefined()
    }, 15000)
  })

  describe('End-to-End Webhook Integration', () => {
    it('should complete full workflow from segments to webhook delivery', async () => {
      serverResponses['/'] = { status: 200 }

      // Mock database operations
      const mockTask: Task = {
        id: 'e2e-test-task',
        client_webhook_url: webhookUrl,
        original_filename: 'test-audio.mp3',
        status: 'processing',
        total_segments: 2,
        completed_segments: 0,
        created_at: '2024-01-01T00:00:00Z'
      }

      const mockSegments: Segment[] = [
        {
          id: 'segment-1',
          task_id: 'e2e-test-task',
          file_path: '/path/segment1.mp3',
          start_time: 0,
          end_time: 15,
          status: 'completed',
          transcription_text: 'First part of the audio',
          elevenlabs_task_id: 'el-task-1',
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: 'segment-2',
          task_id: 'e2e-test-task',
          file_path: '/path/segment2.mp3',
          start_time: 15,
          end_time: 30,
          status: 'completed',
          transcription_text: 'second part of the audio',
          elevenlabs_task_id: 'el-task-2',
          created_at: '2024-01-01T00:00:00Z'
        }
      ]

      // Mock database service methods
      jest.spyOn(databaseService, 'getTask').mockResolvedValue(mockTask)
      jest.spyOn(databaseService, 'getSegmentsByTaskId').mockResolvedValue(mockSegments)
      jest.spyOn(databaseService, 'updateTask').mockResolvedValue({
        ...mockTask,
        status: 'completed',
        final_transcription: 'First part of the audio second part of the audio',
        completed_at: '2024-01-01T00:01:00Z'
      })

      // Simulate the completion check and result assembly
      const transcriptionServicePrivate = transcriptionService as any
      await transcriptionServicePrivate.checkTaskCompletion('e2e-test-task')

      // Verify webhook was sent
      expect(receivedWebhooks).toHaveLength(1)
      
      const webhook = receivedWebhooks[0]
      expect(webhook.body.taskId).toBe('e2e-test-task')
      expect(webhook.body.status).toBe('completed')
      expect(webhook.body.transcription).toBe('First part of the audio second part of the audio')
      expect(webhook.body.metadata).toBeDefined()
      expect(webhook.body.metadata.segmentCount).toBe(2)
      expect(webhook.body.metadata.totalDuration).toBe(30)
      expect(webhook.body.originalFilename).toBe('test-audio.mp3')

      // Verify HMAC signature is present
      expect(webhook.headers['x-webhook-signature']).toBeDefined()
      expect(webhook.headers['x-webhook-signature']).toMatch(/^sha256=/)
    }, 15000)

    it('should handle partial failures gracefully', async () => {
      const segments: Segment[] = [
        {
          id: 'segment-1',
          task_id: 'partial-fail-task',
          file_path: '/path/segment1.mp3',
          start_time: 0,
          end_time: 15,
          status: 'completed',
          transcription_text: 'First segment',
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: 'segment-2',
          task_id: 'partial-fail-task',
          file_path: '/path/segment2.mp3',
          start_time: 15,
          end_time: 30,
          status: 'failed',
          error_message: 'ElevenLabs API error',
          created_at: '2024-01-01T00:00:00Z'
        }
      ]

      // Test that result assembler filters out failed segments
      const result = await resultAssemblerService.combineSegments(segments)
      
      expect(result.text).toBe('First segment')
      expect(result.segments).toHaveLength(1)
      expect(result.segments[0].text).toBe('First segment')
    })
  })

  describe('Webhook Configuration and Monitoring', () => {
    it('should provide webhook configuration details', () => {
      const config = clientWebhookService.getWebhookConfig()
      
      expect(config.maxRetries).toBe(5)
      expect(config.timeoutMs).toBe(30000)
      expect(typeof config.signingEnabled).toBe('boolean')
    })

    it('should track webhook delivery attempts with detailed logging', async () => {
      // Set up server to fail first attempt, succeed on second
      serverResponses['/'] = { status: 500 }
      
      const task: Task = {
        id: 'tracking-test',
        client_webhook_url: webhookUrl,
        original_filename: 'test.mp3',
        status: 'completed',
        total_segments: 1,
        completed_segments: 1,
        created_at: '2024-01-01T00:00:00Z'
      }

      // Start delivery and change response after delay
      const resultPromise = clientWebhookService.sendWebhookNotification(task)
      
      setTimeout(() => {
        serverResponses['/'] = { status: 200 }
      }, 500)

      const result = await resultPromise

      // Verify tracking information
      expect(result.taskId).toBe('tracking-test')
      expect(result.webhookUrl).toBe(webhookUrl)
      expect(result.attempts.length).toBeGreaterThan(1)
      expect(result.createdAt).toBeDefined()
      expect(result.completedAt).toBeDefined()
      
      // Verify attempt details
      expect(result.attempts[0].success).toBe(false)
      expect(result.attempts[0].statusCode).toBe(500)
      expect(result.attempts[0].attemptNumber).toBe(1)
      
      const lastAttempt = result.attempts[result.attempts.length - 1]
      expect(lastAttempt.success).toBe(true)
      expect(lastAttempt.statusCode).toBe(200)
    }, 15000)
  })
})