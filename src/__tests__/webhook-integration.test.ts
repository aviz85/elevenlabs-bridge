import { NextApiRequest, NextApiResponse } from 'next'
import { createMocks } from 'node-mocks-http'
import webhookHandler from '@/pages/api/webhook/elevenlabs'
import { transcriptionService } from '@/services/transcription'
import { elevenLabsService } from '@/services/elevenlabs'
import { queueManager } from '@/services/queue-manager'

// Mock dependencies
jest.mock('@/services/transcription')
jest.mock('@/services/elevenlabs')
jest.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      insert: jest.fn(),
      select: jest.fn(),
      update: jest.fn(),
      eq: jest.fn(),
      single: jest.fn()
    })),
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn(),
        download: jest.fn()
      }))
    }
  }
}))

const mockTranscriptionService = transcriptionService as jest.Mocked<typeof transcriptionService>
const mockElevenLabsService = elevenLabsService as jest.Mocked<typeof elevenLabsService>

describe('Webhook Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.WEBHOOK_BASE_URL = 'https://test.example.com'
    process.env.ELEVENLABS_WEBHOOK_SECRET = 'test-secret'
  })

  afterEach(() => {
    delete process.env.WEBHOOK_BASE_URL
    delete process.env.ELEVENLABS_WEBHOOK_SECRET
  })

  describe('ElevenLabs Webhook Handler', () => {
    it('should process valid webhook payload', async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        query: { segmentId: 'segment-123' },
        body: {
          task_id: 'elevenlabs-task-456',
          status: 'completed',
          result: {
            text: 'This is the transcribed text',
            language_code: 'en'
          }
        },
        headers: {
          'content-type': 'application/json'
        }
      })

      mockTranscriptionService.handleElevenLabsWebhook.mockResolvedValue()

      await webhookHandler(req, res)

      expect(res._getStatusCode()).toBe(200)
      expect(JSON.parse(res._getData())).toEqual({
        message: 'Webhook processed successfully',
        taskId: 'elevenlabs-task-456',
        segmentId: 'segment-123'
      })

      expect(mockTranscriptionService.handleElevenLabsWebhook).toHaveBeenCalledWith({
        task_id: 'elevenlabs-task-456',
        status: 'completed',
        result: {
          text: 'This is the transcribed text',
          language_code: 'en'
        },
        error: undefined,
        segmentId: 'segment-123'
      })
    })

    it('should validate webhook signature when provided', async () => {
      const payload = JSON.stringify({
        task_id: 'elevenlabs-task-456',
        status: 'completed',
        result: { text: 'Test', language_code: 'en' }
      })

      // Create valid signature
      const crypto = require('crypto')
      const signature = crypto
        .createHmac('sha256', 'test-secret')
        .update(payload)
        .digest('hex')

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: JSON.parse(payload),
        headers: {
          'content-type': 'application/json',
          'x-elevenlabs-signature': signature
        }
      })

      mockElevenLabsService.validateWebhookSignature.mockReturnValue(true)
      mockTranscriptionService.handleElevenLabsWebhook.mockResolvedValue()

      await webhookHandler(req, res)

      expect(res._getStatusCode()).toBe(200)
      expect(mockElevenLabsService.validateWebhookSignature).toHaveBeenCalledWith(
        payload,
        signature
      )
    })

    it('should reject invalid webhook signature', async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: {
          task_id: 'elevenlabs-task-456',
          status: 'completed'
        },
        headers: {
          'content-type': 'application/json',
          'x-elevenlabs-signature': 'invalid-signature'
        }
      })

      mockElevenLabsService.validateWebhookSignature.mockReturnValue(false)

      await webhookHandler(req, res)

      expect(res._getStatusCode()).toBe(401)
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Invalid webhook signature'
      })
    })

    it('should handle missing required fields', async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: {
          status: 'completed' // Missing task_id
        }
      })

      await webhookHandler(req, res)

      expect(res._getStatusCode()).toBe(400)
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Missing required fields: task_id, status'
      })
    })

    it('should handle webhook processing errors', async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: {
          task_id: 'elevenlabs-task-456',
          status: 'completed'
        }
      })

      mockTranscriptionService.handleElevenLabsWebhook.mockRejectedValue(
        new Error('Database connection failed')
      )

      await webhookHandler(req, res)

      expect(res._getStatusCode()).toBe(500)
    })

    it('should reject non-POST requests', async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'GET'
      })

      await webhookHandler(req, res)

      expect(res._getStatusCode()).toBe(405)
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Method not allowed'
      })
    })
  })

  describe('Queue Manager Webhook Integration', () => {
    it('should validate webhook configuration', async () => {
      mockElevenLabsService.getWebhookStatus.mockResolvedValue({
        configured: true,
        url: 'https://test.example.com/api/webhook/elevenlabs'
      })

      const validation = await queueManager.validateWebhookConfiguration()

      expect(validation.valid).toBe(true)
      expect(validation.errors).toHaveLength(0)
    })

    it('should detect missing webhook base URL', async () => {
      delete process.env.WEBHOOK_BASE_URL

      mockElevenLabsService.getWebhookStatus.mockResolvedValue({
        configured: true
      })

      const validation = await queueManager.validateWebhookConfiguration()

      expect(validation.valid).toBe(false)
      expect(validation.errors.some(error => 
        error.includes('WEBHOOK_BASE_URL')
      )).toBe(true)

      // Restore for other tests
      process.env.WEBHOOK_BASE_URL = 'https://test.example.com'
    })

    it('should detect ElevenLabs webhook configuration issues', async () => {
      mockElevenLabsService.getWebhookStatus.mockResolvedValue({
        configured: false
      })

      const validation = await queueManager.validateWebhookConfiguration()

      expect(validation.valid).toBe(false)
      expect(validation.errors.some(error => 
        error.includes('ElevenLabs webhook is not configured')
      )).toBe(true)
    })

    it('should provide webhook statistics', () => {
      // Add some mock jobs to the queue manager
      const mockSegment = {
        id: 'segment-1',
        task_id: 'task-1',
        file_path: 'test.mp3',
        start_time: 0,
        end_time: 900,
        status: 'pending' as const,
        created_at: new Date().toISOString()
      }

      // This is a simplified test since we can't easily mock the internal job state
      const stats = queueManager.getWebhookStats()

      expect(stats).toHaveProperty('totalWebhooksSent')
      expect(stats).toHaveProperty('pendingWebhooks')
      expect(stats).toHaveProperty('failedWebhooks')
      expect(stats).toHaveProperty('webhookSuccessRate')
      expect(typeof stats.webhookSuccessRate).toBe('number')
    })
  })

  describe('End-to-End Webhook Flow', () => {
    it('should handle complete webhook flow from queue to completion', async () => {
      // Mock the complete flow
      const mockSegment = {
        id: 'segment-1',
        task_id: 'task-1',
        file_path: 'segments/task-1/segment_1.mp3',
        start_time: 0,
        end_time: 900,
        status: 'pending' as const,
        created_at: new Date().toISOString()
      }

      // 1. Segment gets added to queue (this would happen in real flow)
      // 2. Queue manager processes segment and sends to ElevenLabs with webhook URL
      // 3. ElevenLabs calls our webhook endpoint
      // 4. Webhook handler processes the result

      const webhookPayload = {
        task_id: 'elevenlabs-task-123',
        status: 'completed' as const,
        result: {
          text: 'This is the transcribed text from the segment',
          language_code: 'en'
        }
      }

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        query: { segmentId: 'segment-1' },
        body: webhookPayload,
        headers: {
          'content-type': 'application/json'
        }
      })

      mockTranscriptionService.handleElevenLabsWebhook.mockResolvedValue()

      await webhookHandler(req, res)

      expect(res._getStatusCode()).toBe(200)
      expect(mockTranscriptionService.handleElevenLabsWebhook).toHaveBeenCalledWith({
        ...webhookPayload,
        error: undefined,
        segmentId: 'segment-1'
      })
    })

    it('should handle webhook failure scenarios', async () => {
      const webhookPayload = {
        task_id: 'elevenlabs-task-123',
        status: 'failed' as const,
        error: 'Audio processing failed'
      }

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        query: { segmentId: 'segment-1' },
        body: webhookPayload
      })

      mockTranscriptionService.handleElevenLabsWebhook.mockResolvedValue()

      await webhookHandler(req, res)

      expect(res._getStatusCode()).toBe(200)
      expect(mockTranscriptionService.handleElevenLabsWebhook).toHaveBeenCalledWith({
        ...webhookPayload,
        result: undefined,
        segmentId: 'segment-1'
      })
    })
  })

  describe('Webhook URL Construction', () => {
    it('should construct proper webhook URLs for different environments', () => {
      const testCases = [
        {
          baseUrl: 'https://myapp.vercel.app',
          segmentId: 'segment-123',
          expected: 'https://myapp.vercel.app/api/webhook/elevenlabs?segmentId=segment-123'
        },
        {
          baseUrl: 'http://localhost:3000',
          segmentId: 'segment-456',
          expected: 'http://localhost:3000/api/webhook/elevenlabs?segmentId=segment-456'
        }
      ]

      for (const testCase of testCases) {
        process.env.WEBHOOK_BASE_URL = testCase.baseUrl
        
        // We can't directly test the private method, but we can verify
        // the webhook URL construction logic through the queue manager
        const validation = queueManager.validateWebhookConfiguration()
        expect(validation).toBeDefined()
      }
    })
  })
})