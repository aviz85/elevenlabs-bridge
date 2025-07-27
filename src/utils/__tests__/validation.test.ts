import {
  validateFile,
  validateWebhookUrl,
  validateTaskId,
  SUPPORTED_AUDIO_FORMATS,
  SUPPORTED_VIDEO_FORMATS,
  MAX_FILE_SIZE
} from '../validation'
import { ValidationError } from '@/lib/errors'

describe('Validation Utils', () => {
  describe('validateFile', () => {
    it('should accept valid audio files', () => {
      const file = new File(['test'], 'test.mp3', { type: 'audio/mpeg' })
      expect(() => validateFile(file)).not.toThrow()
    })

    it('should accept valid video files', () => {
      const file = new File(['test'], 'test.mp4', { type: 'video/mp4' })
      expect(() => validateFile(file)).not.toThrow()
    })

    it('should throw ValidationError for null file', () => {
      expect(() => validateFile(null as any)).toThrow(ValidationError)
      expect(() => validateFile(null as any)).toThrow('No file provided')
    })

    it('should throw ValidationError for empty file', () => {
      const file = new File([], 'empty.mp3', { type: 'audio/mpeg' })
      expect(() => validateFile(file)).toThrow(ValidationError)
      expect(() => validateFile(file)).toThrow('File is empty')
    })

    it('should throw ValidationError for oversized file', () => {
      const largeContent = new Array(MAX_FILE_SIZE + 1).fill('a').join('')
      const file = new File([largeContent], 'large.mp3', { type: 'audio/mpeg' })
      expect(() => validateFile(file)).toThrow(ValidationError)
      expect(() => validateFile(file)).toThrow('File size exceeds maximum limit')
    })

    it('should throw ValidationError for unsupported file type', () => {
      const file = new File(['test'], 'test.txt', { type: 'text/plain' })
      expect(() => validateFile(file)).toThrow(ValidationError)
      expect(() => validateFile(file)).toThrow('Unsupported file format')
    })

    it('should accept files at the size limit', () => {
      const content = new Array(MAX_FILE_SIZE).fill('a').join('')
      const file = new File([content], 'limit.mp3', { type: 'audio/mpeg' })
      expect(() => validateFile(file)).not.toThrow()
    })
  })

  describe('validateWebhookUrl', () => {
    it('should accept valid HTTP URLs', () => {
      expect(() => validateWebhookUrl('http://example.com/webhook')).not.toThrow()
    })

    it('should accept valid HTTPS URLs', () => {
      expect(() => validateWebhookUrl('https://example.com/webhook')).not.toThrow()
    })

    it('should accept URLs with ports', () => {
      expect(() => validateWebhookUrl('https://example.com:8080/webhook')).not.toThrow()
    })

    it('should accept URLs with query parameters', () => {
      expect(() => validateWebhookUrl('https://example.com/webhook?token=123')).not.toThrow()
    })

    it('should throw ValidationError for empty URL', () => {
      expect(() => validateWebhookUrl('')).toThrow(ValidationError)
      expect(() => validateWebhookUrl('')).toThrow('Webhook URL is required')
    })

    it('should throw ValidationError for invalid URL format', () => {
      expect(() => validateWebhookUrl('not-a-url')).toThrow(ValidationError)
      expect(() => validateWebhookUrl('not-a-url')).toThrow('Invalid webhook URL format')
    })

    it('should throw ValidationError for non-HTTP protocols', () => {
      expect(() => validateWebhookUrl('ftp://example.com')).toThrow(ValidationError)
      expect(() => validateWebhookUrl('ftp://example.com')).toThrow('Webhook URL must use HTTP or HTTPS protocol')
    })

    it('should throw ValidationError for file protocol', () => {
      expect(() => validateWebhookUrl('file:///path/to/file')).toThrow(ValidationError)
      expect(() => validateWebhookUrl('file:///path/to/file')).toThrow('Webhook URL must use HTTP or HTTPS protocol')
    })
  })

  describe('validateTaskId', () => {
    it('should accept valid UUID v4', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000'
      expect(() => validateTaskId(validUuid)).not.toThrow()
    })

    it('should accept another valid UUID v4', () => {
      const validUuid = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
      expect(() => validateTaskId(validUuid)).not.toThrow()
    })

    it('should throw ValidationError for empty task ID', () => {
      expect(() => validateTaskId('')).toThrow(ValidationError)
      expect(() => validateTaskId('')).toThrow('Task ID is required')
    })

    it('should throw ValidationError for invalid UUID format', () => {
      expect(() => validateTaskId('not-a-uuid')).toThrow(ValidationError)
      expect(() => validateTaskId('not-a-uuid')).toThrow('Invalid task ID format')
    })

    it('should throw ValidationError for UUID with wrong version', () => {
      const uuidV1 = '550e8400-e29b-11d4-a716-446655440000' // version 1
      expect(() => validateTaskId(uuidV1)).toThrow(ValidationError)
      expect(() => validateTaskId(uuidV1)).toThrow('Invalid task ID format')
    })

    it('should throw ValidationError for UUID with wrong variant', () => {
      const invalidVariant = '550e8400-e29b-41d4-1716-446655440000' // wrong variant
      expect(() => validateTaskId(invalidVariant)).toThrow(ValidationError)
      expect(() => validateTaskId(invalidVariant)).toThrow('Invalid task ID format')
    })

    it('should throw ValidationError for UUID with wrong length', () => {
      const shortUuid = '550e8400-e29b-41d4-a716-44665544000'
      expect(() => validateTaskId(shortUuid)).toThrow(ValidationError)
      expect(() => validateTaskId(shortUuid)).toThrow('Invalid task ID format')
    })
  })

  describe('Constants', () => {
    it('should have expected audio formats', () => {
      expect(SUPPORTED_AUDIO_FORMATS).toContain('audio/mpeg')
      expect(SUPPORTED_AUDIO_FORMATS).toContain('audio/mp3')
      expect(SUPPORTED_AUDIO_FORMATS).toContain('audio/wav')
      expect(SUPPORTED_AUDIO_FORMATS).toContain('audio/m4a')
    })

    it('should have expected video formats', () => {
      expect(SUPPORTED_VIDEO_FORMATS).toContain('video/mp4')
      expect(SUPPORTED_VIDEO_FORMATS).toContain('video/avi')
      expect(SUPPORTED_VIDEO_FORMATS).toContain('video/mov')
    })

    it('should have reasonable file size limit', () => {
      expect(MAX_FILE_SIZE).toBe(100 * 1024 * 1024) // 100MB
    })
  })
})