import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { clientWebhookService } from '../client-webhook'
import { Task } from '@/types'
import crypto from 'crypto'

// Mock fetch globally
global.fetch = jest.fn()

describe('ClientWebhookService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(fetch as jest.Mock).mockClear()
  })

  describe('HMAC Signature', () => {
    it('should create and verify HMAC signatures correctly', () => {
      const payload = JSON.stringify({ test: 'data' })
      
      // Create signature using the service's method
      const service = clientWebhookService as any
      const signature = service.createHMACSignature(payload)
      
      expect(signature).toMatch(/^sha256=/)
      
      // Verify the signature
      const isValid = clientWebhookService.verifyHMACSignature(payload, signature)
      expect(isValid).toBe(true)
      
      // Test with invalid signature
      const isInvalid = clientWebhookService.verifyHMACSignature(payload, 'invalid-signature')
      expect(isInvalid).toBe(false)
    })

    it('should handle signature length mismatch', () => {
      const payload = JSON.stringify({ test: 'data' })
      const shortSignature = 'short'
      
      const isValid = clientWebhookService.verifyHMACSignature(payload, shortSignature)
      expect(isValid).toBe(false)
    })
  })

  describe('Webhook Payload Creation', () => {
    it('should create proper webhook payload for successful transcription', () => {
      const task: Task = {
        id: 'test-task',
        client_webhook_url: 'https://example.com/webhook',
        original_filename: 'test.mp3',
        status: 'completed',
        total_segments: 2,
        completed_segments: 2,
        final_transcription: 'Test transcription',
        created_at: '2024-01-01T00:00:00Z'
      }

      const combinedTranscription = {
        text: 'Test transcription',
        segments: [
          { startTime: 0, endTime: 15, text: 'Test' },
          { startTime: 15, endTime: 30, text: 'transcription' }
        ],
        metadata: {
          totalDuration: 30,
          languageCode: 'en',
          confidence: 0.9
        }
      }

      const service = clientWebhookService as any
      const payload = service.createWebhookPayload(task, combinedTranscription)

      expect(payload.taskId).toBe('test-task')
      expect(payload.status).toBe('completed')
      expect(payload.transcription).toBe('Test transcription')
      expect(payload.originalFilename).toBe('test.mp3')
      expect(payload.metadata).toBeDefined()
      expect(payload.metadata?.totalDuration).toBe(30)
      expect(payload.metadata?.languageCode).toBe('en')
      expect(payload.metadata?.confidence).toBe(0.9)
      expect(payload.metadata?.wordCount).toBe(2)
      expect(payload.metadata?.segmentCount).toBe(2)
      expect(payload.completedAt).toBeDefined()
    })

    it('should create proper webhook payload for failed transcription', () => {
      const task: Task = {
        id: 'failed-task',
        client_webhook_url: 'https://example.com/webhook',
        original_filename: 'test.mp3',
        status: 'failed',
        total_segments: 1,
        completed_segments: 0,
        error_message: 'Processing failed',
        created_at: '2024-01-01T00:00:00Z'
      }

      const service = clientWebhookService as any
      const payload = service.createWebhookPayload(task, undefined, 'Processing failed')

      expect(payload.taskId).toBe('failed-task')
      expect(payload.status).toBe('failed')
      expect(payload.error).toBe('Processing failed')
      expect(payload.transcription).toBeUndefined()
      expect(payload.metadata).toBeUndefined()
      expect(payload.originalFilename).toBe('test.mp3')
    })
  })

  describe('Backoff Calculation', () => {
    it('should calculate exponential backoff with jitter', () => {
      const service = clientWebhookService as any
      
      const delay1 = service.calculateBackoffDelay(1)
      const delay2 = service.calculateBackoffDelay(2)
      const delay3 = service.calculateBackoffDelay(3)
      
      // First attempt should be around 1 second (with jitter)
      expect(delay1).toBeGreaterThan(500)
      expect(delay1).toBeLessThan(2000)
      
      // Second attempt should be around 2 seconds (with jitter)
      expect(delay2).toBeGreaterThan(1000)
      expect(delay2).toBeLessThan(4000)
      
      // Third attempt should be around 4 seconds (with jitter)
      expect(delay3).toBeGreaterThan(2000)
      expect(delay3).toBeLessThan(8000)
      
      // Delays should generally increase
      expect(delay2).toBeGreaterThan(delay1 * 0.5) // Account for jitter
      expect(delay3).toBeGreaterThan(delay2 * 0.5) // Account for jitter
    })

    it('should cap maximum delay', () => {
      const service = clientWebhookService as any
      
      // Test with very high attempt number
      const delay = service.calculateBackoffDelay(20)
      
      // Should not exceed maximum delay (60 seconds + jitter)
      expect(delay).toBeLessThan(80000) // 60s + 25% jitter buffer
    })
  })

  describe('Configuration', () => {
    it('should provide webhook configuration', () => {
      const config = clientWebhookService.getWebhookConfig()
      
      expect(config.maxRetries).toBe(5)
      expect(config.timeoutMs).toBe(30000)
      expect(typeof config.signingEnabled).toBe('boolean')
    })
  })

  describe('Webhook Delivery Attempt', () => {
    it('should handle successful webhook delivery', async () => {
      const mockResponse = {
        status: 200,
        text: jest.fn().mockResolvedValue('{"success": true}')
      }
      ;(fetch as jest.Mock).mockResolvedValue(mockResponse)

      const task: Task = {
        id: 'test-task',
        client_webhook_url: 'https://example.com/webhook',
        original_filename: 'test.mp3',
        status: 'completed',
        total_segments: 1,
        completed_segments: 1,
        created_at: '2024-01-01T00:00:00Z'
      }

      const service = clientWebhookService as any
      const payload = service.createWebhookPayload(task)
      const result = await service.attemptWebhookDelivery('https://example.com/webhook', payload, 1)

      expect(result.success).toBe(true)
      expect(result.statusCode).toBe(200)
      expect(result.attemptNumber).toBe(1)
      expect(result.responseBody).toBe('{"success": true}')
      
      // Verify fetch was called with correct parameters
      expect(fetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'User-Agent': 'ElevenLabs-Proxy-Server/1.0',
            'X-Webhook-Signature': expect.stringMatching(/^sha256=/),
            'X-Webhook-Timestamp': expect.any(String),
            'X-Webhook-Attempt': '1'
          }),
          body: expect.any(String)
        })
      )
    })

    it('should handle failed webhook delivery', async () => {
      const mockResponse = {
        status: 500,
        text: jest.fn().mockResolvedValue('Internal Server Error')
      }
      ;(fetch as jest.Mock).mockResolvedValue(mockResponse)

      const task: Task = {
        id: 'test-task',
        client_webhook_url: 'https://example.com/webhook',
        original_filename: 'test.mp3',
        status: 'completed',
        total_segments: 1,
        completed_segments: 1,
        created_at: '2024-01-01T00:00:00Z'
      }

      const service = clientWebhookService as any
      const payload = service.createWebhookPayload(task)
      const result = await service.attemptWebhookDelivery('https://example.com/webhook', payload, 1)

      expect(result.success).toBe(false)
      expect(result.statusCode).toBe(500)
      expect(result.error).toBe('HTTP 500: Internal Server Error')
      expect(result.attemptNumber).toBe(1)
    })

    it('should handle network errors', async () => {
      ;(fetch as jest.Mock).mockRejectedValue(new Error('Network error'))

      const task: Task = {
        id: 'test-task',
        client_webhook_url: 'https://example.com/webhook',
        original_filename: 'test.mp3',
        status: 'completed',
        total_segments: 1,
        completed_segments: 1,
        created_at: '2024-01-01T00:00:00Z'
      }

      const service = clientWebhookService as any
      const payload = service.createWebhookPayload(task)
      const result = await service.attemptWebhookDelivery('https://example.com/webhook', payload, 1)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Network error')
      expect(result.attemptNumber).toBe(1)
    })
  })
})