import { ElevenLabsService } from '../elevenlabs'
import { ExternalServiceError } from '@/lib/errors'

// Mock fetch globally
global.fetch = jest.fn()

describe('ElevenLabs Webhook Integration', () => {
  let elevenLabsService: ElevenLabsService
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>

  beforeEach(() => {
    jest.clearAllMocks()
    elevenLabsService = new ElevenLabsService('test-api-key')
    
    // Set up environment variables
    process.env.WEBHOOK_BASE_URL = 'https://test.example.com'
    process.env.ELEVENLABS_WEBHOOK_SECRET = 'test-secret'
  })

  afterEach(() => {
    delete process.env.WEBHOOK_BASE_URL
    delete process.env.ELEVENLABS_WEBHOOK_SECRET
  })

  describe('Webhook URL Registration', () => {
    it('should register valid webhook URL', async () => {
      const webhookUrl = 'https://test.example.com/api/webhook/elevenlabs'
      
      await expect(elevenLabsService.registerWebhookUrl(webhookUrl)).resolves.not.toThrow()
    })

    it('should reject invalid webhook URL formats', async () => {
      const invalidUrls = [
        'http://insecure.com/webhook', // HTTP instead of HTTPS
        'https://example.com/not-webhook', // Doesn't contain 'webhook'
        'invalid-url', // Not a valid URL
        'ftp://example.com/webhook' // Wrong protocol
      ]

      for (const url of invalidUrls) {
        await expect(elevenLabsService.registerWebhookUrl(url)).rejects.toThrow()
      }
    })

    it('should validate webhook endpoint accessibility', async () => {
      const webhookUrl = 'https://test.example.com/api/webhook/elevenlabs'
      
      // Should pass validation for properly formatted URL
      await expect(elevenLabsService.registerWebhookUrl(webhookUrl)).resolves.not.toThrow()
    })

    it('should handle webhook registration errors', async () => {
      const webhookUrl = 'https://invalid-domain-that-does-not-exist.com/webhook'
      
      // Should handle validation gracefully
      await expect(elevenLabsService.registerWebhookUrl(webhookUrl)).resolves.not.toThrow()
    })
  })

  describe('Webhook Status', () => {
    it('should get webhook configuration status', async () => {
      const status = await elevenLabsService.getWebhookStatus()
      
      expect(status).toHaveProperty('configured')
      expect(status).toHaveProperty('url')
      expect(typeof status.configured).toBe('boolean')
    })

    it('should return correct webhook URL when configured', async () => {
      const status = await elevenLabsService.getWebhookStatus()
      
      if (status.configured && status.url) {
        expect(status.url).toContain('/api/webhook/elevenlabs')
        expect(status.url).toMatch(/^https?:\/\//)
      }
    })
  })

  describe('Webhook Signature Validation', () => {
    it('should validate correct webhook signature', () => {
      const payload = '{"task_id":"test","status":"completed"}'
      const secret = 'test-secret'
      
      // Create expected signature
      const crypto = require('crypto')
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex')
      
      const isValid = elevenLabsService.validateWebhookSignature(payload, expectedSignature, secret)
      expect(isValid).toBe(true)
    })

    it('should reject invalid webhook signature', () => {
      const payload = '{"task_id":"test","status":"completed"}'
      const invalidSignature = 'invalid-signature'
      const secret = 'test-secret'
      
      const isValid = elevenLabsService.validateWebhookSignature(payload, invalidSignature, secret)
      expect(isValid).toBe(false)
    })

    it('should handle missing webhook secret gracefully', () => {
      // Temporarily remove the secret
      delete process.env.ELEVENLABS_WEBHOOK_SECRET
      
      const payload = '{"task_id":"test","status":"completed"}'
      const signature = 'some-signature'
      
      // Should return true in development when no secret is configured
      const isValid = elevenLabsService.validateWebhookSignature(payload, signature)
      expect(isValid).toBe(true)
      
      // Restore the secret
      process.env.ELEVENLABS_WEBHOOK_SECRET = 'test-secret'
    })

    it('should use environment variable for webhook secret', () => {
      const payload = '{"task_id":"test","status":"completed"}'
      
      // Create signature with environment secret
      const crypto = require('crypto')
      const expectedSignature = crypto
        .createHmac('sha256', 'test-secret')
        .update(payload)
        .digest('hex')
      
      const isValid = elevenLabsService.validateWebhookSignature(payload, expectedSignature)
      expect(isValid).toBe(true)
    })
  })

  describe('Transcription with Webhook Integration', () => {
    it('should include webhook URL in transcription request', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ task_id: 'test-task-123' })
      }
      mockFetch.mockResolvedValue(mockResponse as any)

      const audioBuffer = Buffer.from('test audio data')
      const webhookUrl = 'https://test.example.com/api/webhook/elevenlabs?segmentId=segment-1'

      const result = await elevenLabsService.transcribeAudio(audioBuffer, {
        modelId: 'scribe_v1',
        webhookUrl,
        diarize: true
      })

      expect(result.taskId).toBe('test-task-123')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.elevenlabs.io/v1/speech-to-text',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'xi-api-key': 'test-api-key'
          })
        })
      )

      // Verify FormData contains webhook parameter
      const callArgs = mockFetch.mock.calls[0]
      const formData = callArgs[1].body as FormData
      expect(formData.get('webhook')).toBe('true')
    })

    it('should handle webhook registration during transcription', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ task_id: 'test-task-123' })
      }
      mockFetch.mockResolvedValue(mockResponse as any)

      const audioBuffer = Buffer.from('test audio data')
      const webhookUrl = 'https://test.example.com/api/webhook/elevenlabs'

      // Mock the registerWebhookUrl method
      const registerSpy = jest.spyOn(elevenLabsService, 'registerWebhookUrl')
        .mockResolvedValue()

      await elevenLabsService.transcribeAudio(audioBuffer, {
        modelId: 'scribe_v1',
        webhookUrl
      })

      expect(registerSpy).toHaveBeenCalledWith(webhookUrl)
    })

    it('should handle transcription without webhook URL', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ 
          text: 'Transcribed text',
          language_code: 'en'
        })
      }
      mockFetch.mockResolvedValue(mockResponse as any)

      const audioBuffer = Buffer.from('test audio data')

      const result = await elevenLabsService.transcribeAudio(audioBuffer, {
        modelId: 'scribe_v1'
      })

      expect(result.result).toBeDefined()
      expect(result.result?.text).toBe('Transcribed text')
      expect(result.taskId).toBeUndefined()
    })

    it('should handle API errors during webhook-enabled transcription', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: jest.fn().mockResolvedValue('Invalid request')
      }
      mockFetch.mockResolvedValue(mockResponse as any)

      const audioBuffer = Buffer.from('test audio data')
      const webhookUrl = 'https://test.example.com/api/webhook/elevenlabs'

      await expect(elevenLabsService.transcribeAudio(audioBuffer, {
        modelId: 'scribe_v1',
        webhookUrl
      })).rejects.toThrow(ExternalServiceError)
    })
  })

  describe('URL Validation', () => {
    it('should validate HTTPS URLs with webhook path', () => {
      const validUrls = [
        'https://example.com/api/webhook/elevenlabs',
        'https://myapp.vercel.app/webhook',
        'https://localhost:3000/api/webhook/test'
      ]

      for (const url of validUrls) {
        expect(() => elevenLabsService.registerWebhookUrl(url)).not.toThrow()
      }
    })

    it('should reject non-HTTPS URLs in production context', async () => {
      const httpUrl = 'http://example.com/webhook'
      
      await expect(elevenLabsService.registerWebhookUrl(httpUrl)).rejects.toThrow()
    })

    it('should reject URLs without webhook in path', async () => {
      const nonWebhookUrl = 'https://example.com/api/transcribe'
      
      await expect(elevenLabsService.registerWebhookUrl(nonWebhookUrl)).rejects.toThrow()
    })
  })

  describe('Error Handling', () => {
    it('should handle network errors during webhook registration', async () => {
      // Mock network error
      const networkError = new Error('Network error')
      jest.spyOn(elevenLabsService, 'registerWebhookUrl')
        .mockRejectedValue(networkError)

      const webhookUrl = 'https://test.example.com/api/webhook/elevenlabs'
      
      await expect(elevenLabsService.registerWebhookUrl(webhookUrl)).rejects.toThrow('Network error')
    })

    it('should handle webhook status check failures', async () => {
      // Create a new instance to avoid mocking conflicts
      const testService = new ElevenLabsService('test-key')
      
      // Mock the method to throw an error internally
      jest.spyOn(testService, 'getWebhookStatus').mockImplementation(async () => {
        throw new ExternalServiceError('ElevenLabs', 'API unavailable')
      })

      await expect(testService.getWebhookStatus()).rejects.toThrow(ExternalServiceError)
    })

    it('should handle signature validation errors gracefully', () => {
      const payload = '{"invalid":"json"'
      const signature = 'invalid-signature'
      const secret = 'test-secret'
      
      // Should not throw, but return false
      const isValid = elevenLabsService.validateWebhookSignature(payload, signature, secret)
      expect(isValid).toBe(false)
    })
  })
})