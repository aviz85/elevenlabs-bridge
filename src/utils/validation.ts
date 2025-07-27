import { ValidationError } from '@/lib/errors'

export const SUPPORTED_AUDIO_FORMATS = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/m4a',
  'audio/aac',
  'audio/ogg',
  'audio/flac'
]

export const SUPPORTED_VIDEO_FORMATS = [
  'video/mp4',
  'video/avi',
  'video/mov',
  'video/wmv',
  'video/flv',
  'video/webm'
]

export const ALL_SUPPORTED_FORMATS = [...SUPPORTED_AUDIO_FORMATS, ...SUPPORTED_VIDEO_FORMATS]

export const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

export function validateFile(file: File): void {
  if (!file) {
    throw new ValidationError('No file provided')
  }

  if (file.size === 0) {
    throw new ValidationError('File is empty')
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new ValidationError(
      `File size exceeds maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`
    )
  }

  if (!ALL_SUPPORTED_FORMATS.includes(file.type)) {
    throw new ValidationError(
      `Unsupported file format: ${file.type}. Supported formats: ${ALL_SUPPORTED_FORMATS.join(', ')}`
    )
  }
}

export function validateWebhookUrl(url: string): void {
  if (!url) {
    throw new ValidationError('Webhook URL is required')
  }

  try {
    const parsedUrl = new URL(url)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new ValidationError('Webhook URL must use HTTP or HTTPS protocol')
    }
  } catch (error) {
    throw new ValidationError('Invalid webhook URL format')
  }
}

export function validateTaskId(taskId: string): void {
  if (!taskId) {
    throw new ValidationError('Task ID is required')
  }

  // UUID v4 validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(taskId)) {
    throw new ValidationError('Invalid task ID format')
  }
}