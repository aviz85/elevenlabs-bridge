// Core data models
export interface Task {
  id: string
  client_webhook_url: string
  original_filename: string
  converted_file_path?: string
  status: 'processing' | 'completed' | 'failed'
  total_segments: number
  completed_segments: number
  final_transcription?: string
  error_message?: string
  created_at: string
  completed_at?: string
}

export interface Segment {
  id: string
  task_id: string
  file_path: string
  start_time: number
  end_time: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  transcription_text?: string
  elevenlabs_task_id?: string
  error_message?: string
  created_at: string
  completed_at?: string
}

// API request/response types
export interface TranscribeRequest {
  file: File
  webhookUrl: string
}

export interface TranscribeResponse {
  taskId: string
  status: string
  message: string
}

export interface TaskStatusResponse {
  taskId: string
  status: string
  progress: {
    totalSegments: number
    completedSegments: number
    percentage: number
  }
  segments?: Segment[]
  finalTranscription?: string
  error?: string
  createdAt: string
  completedAt?: string
}

// ElevenLabs API types
export interface ElevenLabsTranscriptionOptions {
  modelId: 'scribe_v1'
  languageCode?: string
  diarize?: boolean
  tagAudioEvents?: boolean
  webhook?: boolean
}

export interface ElevenLabsTranscriptionResult {
  text: string
  language_code: string
  language_probability: number
  words?: Array<{
    text: string
    start: number
    end: number
    type: 'word' | 'spacing'
    speaker_id?: string
  }>
}

export interface ElevenLabsWebhookPayload {
  task_id: string
  status: 'completed' | 'failed'
  result?: ElevenLabsTranscriptionResult
  error?: string
}

// Audio processing types
export interface AudioSegment {
  id: string
  taskId: string
  filePath: string
  startTime: number
  endTime: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
}

export interface CombinedTranscription {
  text: string
  segments: Array<{
    startTime: number
    endTime: number
    text: string
  }>
  metadata: {
    totalDuration: number
    languageCode: string
    confidence: number
  }
}

// Queue management types
export interface QueueStatus {
  pending: number
  processing: number
  completed: number
  failed: number
}

// Error types
export interface ApiError {
  code: string
  message: string
  details?: any
  errorId?: string
  isRetryable?: boolean
}

// Monitoring and health types
export interface HealthCheckResult {
  healthy: boolean
  timestamp: string
  checks: Record<string, {
    healthy: boolean
    error?: string
    duration: number
  }>
}

export interface CircuitBreakerStats {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'
  failureCount: number
  successCount: number
  totalRequests: number
  lastFailureTime?: string
  nextAttemptTime?: string
}