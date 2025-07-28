import { config } from '@/lib/config'

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

// Audio formats
export const AUDIO_FORMATS = [
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 
  'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/flac',
  'audio/webm', 'audio/x-m4a'
]

// Video formats (will be converted to audio)
export const VIDEO_FORMATS = [
  'video/mp4', 'video/mpeg', 'video/quicktime', 'video/x-msvideo',
  'video/webm', 'video/3gpp', 'video/x-flv', 'video/x-ms-wmv',
  'video/mov', 'video/avi', 'video/mkv'
]

export const ALL_SUPPORTED_FORMATS = [...AUDIO_FORMATS, ...VIDEO_FORMATS]

// Dynamic file size limits based on processing method
export const MAX_FILE_SIZE_SUPABASE = 50 * 1024 * 1024 // 50MB for Supabase
export const MAX_FILE_SIZE_GOOGLE = 2 * 1024 * 1024 * 1024 // 2GB for Google Cloud Functions
export const MAX_FILE_SIZE_VERCEL = 100 * 1024 * 1024 // 100MB for Vercel

export function validateFile(file: File): void {
  if (!file) {
    throw new ValidationError('No file provided')
  }

  if (file.size === 0) {
    throw new ValidationError('File is empty')
  }

  // Dynamic size limit based on processing method
  const maxFileSize = config.google.useGoogleFunctions 
    ? MAX_FILE_SIZE_GOOGLE 
    : MAX_FILE_SIZE_SUPABASE

  if (file.size > maxFileSize) {
    const limitMB = maxFileSize / (1024 * 1024)
    const processingMethod = config.google.useGoogleFunctions ? 'Google Cloud Functions' : 'Supabase'
    throw new ValidationError(
      `File size exceeds maximum limit of ${limitMB}MB for ${processingMethod}`
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

export function getFileTypeInfo(filename: string, mimeType: string): { 
  isVideo: boolean, 
  isAudio: boolean, 
  expectedFormat: string 
} {
  const isVideo = VIDEO_FORMATS.includes(mimeType)
  const isAudio = AUDIO_FORMATS.includes(mimeType)
  
  return {
    isVideo,
    isAudio,
    expectedFormat: isVideo ? 'mp3' : 'mp3' // Always convert to MP3
  }
}