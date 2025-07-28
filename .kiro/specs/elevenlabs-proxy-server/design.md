# Design Document

## Overview

The ElevenLabs Proxy Server is a production-ready Next.js application deployed on Vercel that provides a robust intermediary service for processing large audio/video files through ElevenLabs' Scribe speech-to-text API. The system addresses the limitations of direct API usage by implementing file chunking, concurrent processing, queue management, comprehensive webhook integration, and automatic cleanup.

Key design principles:
- **Production Readiness**: Fully deployed on Vercel with proper webhook handling and monitoring
- **Webhook Integration**: Complete bidirectional webhook communication with ElevenLabs and client servers
- **Scalability**: Handle files of any size through intelligent chunking within Vercel's constraints
- **Reliability**: Implement comprehensive error handling, retry mechanisms, and webhook delivery guarantees
- **Efficiency**: Maximize throughput through concurrent processing and asynchronous webhook handling
- **Cost Optimization**: Automatic cleanup of temporary resources and efficient Vercel function usage
- **Security**: Proper webhook signature validation and secure communication protocols
- **Transparency**: Full visibility into processing status, webhook delivery, and production metrics

## Architecture

### High-Level Architecture

```mermaid
graph TB
    Client[Client Server] --> |POST /api/transcribe| API[Next.js API on Vercel]
    API --> Queue[Queue Manager]
    API --> DB[(Supabase Database)]
    API --> Storage[(Supabase Storage)]
    API --> EdgeFunc[Supabase Edge Functions]
    
    Queue --> |Transcribe Segments| EL[ElevenLabs API]
    EL --> |Webhook Results| WebhookHandler[/api/webhook/elevenlabs]
    WebhookHandler --> DB
    WebhookHandler --> ResultProcessor[Result Assembly]
    
    ResultProcessor --> |Complete Transcription| ClientWebhook[Client Server Webhook]
    ResultProcessor --> DB
    
    EdgeFunc --> |Audio Processing| Storage
    Cleanup[Cleanup Service] --> Storage
    Cleanup --> DB
    
    subgraph "Vercel Deployment"
        API
        WebhookHandler
        Queue
        ResultProcessor
        Cleanup
    end
    
    subgraph "Supabase Infrastructure"
        DB
        Storage
        EdgeFunc
    end
```

### Component Architecture

The system follows a modular architecture with clear separation of concerns:

1. **API Layer**: Next.js API routes handling HTTP requests
2. **Queue Management**: Background job processing for concurrent API calls
3. **Database Layer**: Supabase for persistent data storage
4. **Storage Layer**: Supabase Storage for temporary file management
5. **Webhook System**: Bidirectional webhook handling
6. **Cleanup Service**: Automated resource management

## Components and Interfaces

### 1. API Routes (`/pages/api/`)

#### `/api/transcribe` (POST)
- **Purpose**: Main endpoint for file upload and transcription initiation
- **Input**: Multipart form data with audio/video file and webhook URL
- **Output**: Task ID and initial status
- **Process Flow**:
  1. Validate file format and size
  2. Convert to MP3 using FFmpeg
  3. Upload to Supabase Storage
  4. Create task record in database
  5. Split file into 15-minute chunks if necessary
  6. Queue segments for processing
  7. Return task ID to client

#### `/api/webhook/elevenlabs` (POST)
- **Purpose**: Receive transcription results from ElevenLabs
- **Input**: ElevenLabs webhook payload
- **Output**: HTTP 200 acknowledgment
- **Process Flow**:
  1. Validate webhook signature
  2. Extract transcription data
  3. Update segment status in database
  4. Check if all segments complete
  5. Trigger result assembly if ready

#### `/api/status/:taskId` (GET)
- **Purpose**: Query task progress and status
- **Input**: Task ID parameter
- **Output**: Current task status and progress information

### 2. Queue Management System

#### Queue Manager
```typescript
interface QueueManager {
  addSegment(segment: AudioSegment): Promise<void>
  processQueue(): Promise<void>
  getQueueStatus(): QueueStatus
}

interface AudioSegment {
  id: string
  taskId: string
  filePath: string
  startTime: number
  endTime: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
}
```

#### Concurrent Processing
- **Concurrency Limit**: Configurable (default: 4 concurrent requests)
- **Retry Logic**: Exponential backoff with maximum 3 attempts
- **Rate Limiting**: Respect ElevenLabs API rate limits
- **Error Handling**: Comprehensive logging and failure recovery

### 3. Database Schema (Supabase)

#### Tasks Table
```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_webhook_url TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  converted_file_path TEXT,
  status TEXT NOT NULL DEFAULT 'processing',
  total_segments INTEGER DEFAULT 1,
  completed_segments INTEGER DEFAULT 0,
  final_transcription TEXT,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);
```

#### Segments Table
```sql
CREATE TABLE segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  transcription_text TEXT,
  elevenlabs_task_id TEXT,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);
```

### 4. File Processing Pipeline

#### Audio Conversion Service
```typescript
interface AudioConverter {
  convertToMp3(inputFile: Buffer, originalFormat: string): Promise<Buffer>
  splitAudio(audioFile: Buffer, segmentDuration: number): Promise<AudioSegment[]>
  getAudioDuration(audioFile: Buffer): Promise<number>
}
```

#### Implementation Details:
- **Supabase Edge Functions**: Use Deno-based Edge Functions for FFmpeg processing
- **Alternative Approach**: Use Web Audio API for basic audio manipulation where possible
- **Format Support**: Focus on common formats (MP3, MP4, WAV, M4A) that can be processed
- **Segmentation Strategy**: 
  - For video files: Extract audio track first using Edge Functions
  - For audio files: Use time-based chunking without re-encoding when possible
  - Upload original file to Supabase Storage and process server-side

### 5. ElevenLabs Integration

#### Scribe API Client
```typescript
interface ElevenLabsClient {
  transcribeAudio(audioFile: Buffer, options: TranscriptionOptions): Promise<TranscriptionResult>
  setupWebhook(webhookUrl: string): Promise<void>
}

interface TranscriptionOptions {
  modelId: 'scribe_v1'
  languageCode?: string
  diarize?: boolean
  tagAudioEvents?: boolean
  webhook?: boolean
}
```

#### API Configuration:
- **Model**: scribe_v1 (primary model for speech-to-text)
- **Webhook Mode**: Enabled for asynchronous processing
- **Authentication**: Bearer token with provided API key
- **Error Handling**: Comprehensive retry and fallback mechanisms

### 6. Result Assembly System

#### Transcription Combiner
```typescript
interface ResultAssembler {
  combineSegments(segments: TranscriptionSegment[]): Promise<CombinedTranscription>
  validateCompleteness(taskId: string): Promise<boolean>
  sendClientWebhook(taskId: string, transcription: string): Promise<void>
}

interface CombinedTranscription {
  text: string
  segments: TranscriptionSegment[]
  metadata: {
    totalDuration: number
    languageCode: string
    confidence: number
  }
}
```

## Data Models

### Core Data Structures

#### Task Model
```typescript
interface Task {
  id: string
  clientWebhookUrl: string
  originalFilename: string
  convertedFilePath?: string
  status: 'processing' | 'completed' | 'failed'
  totalSegments: number
  completedSegments: number
  finalTranscription?: string
  errorMessage?: string
  createdAt: Date
  completedAt?: Date
}
```

#### Segment Model
```typescript
interface Segment {
  id: string
  taskId: string
  filePath: string
  startTime: number
  endTime: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  transcriptionText?: string
  elevenlabsTaskId?: string
  errorMessage?: string
  createdAt: Date
  completedAt?: Date
}
```

## Error Handling

### Error Categories and Responses

#### 1. File Processing Errors
- **Invalid Format**: Return 400 with supported formats list
- **File Too Large**: Return 413 with size limits
- **Conversion Failure**: Return 500 with retry suggestion

#### 2. API Integration Errors
- **Authentication Failure**: Return 401 with API key validation message
- **Rate Limiting**: Implement exponential backoff and queue management
- **Service Unavailable**: Return 503 with retry-after header

#### 3. Database Errors
- **Connection Issues**: Implement connection pooling and retry logic
- **Constraint Violations**: Return 400 with specific validation errors
- **Transaction Failures**: Implement rollback and cleanup procedures

#### 4. Webhook Errors
- **Client Webhook Failure**: Implement retry with exponential backoff
- **Invalid Payload**: Log error and continue processing
- **Timeout Issues**: Configure appropriate timeout values

### Error Recovery Strategies

1. **Automatic Retry**: Exponential backoff for transient failures
2. **Circuit Breaker**: Prevent cascade failures in external services
3. **Graceful Degradation**: Continue processing other segments on partial failures
4. **Dead Letter Queue**: Handle permanently failed items
5. **Monitoring and Alerting**: Comprehensive logging and notification system

## Testing Strategy

### Unit Testing
- **API Routes**: Test all endpoints with various input scenarios
- **Audio Processing**: Validate conversion and segmentation logic
- **Database Operations**: Test CRUD operations and transactions
- **Queue Management**: Verify concurrent processing and error handling

### Integration Testing
- **ElevenLabs API**: Test with real API calls and webhook responses
- **Supabase Integration**: Validate database and storage operations
- **End-to-End Workflows**: Complete file processing pipelines
- **Webhook Handling**: Bidirectional webhook communication

### Performance Testing
- **Load Testing**: Concurrent file uploads and processing
- **Stress Testing**: System behavior under high load
- **Memory Usage**: Monitor for memory leaks in audio processing
- **Database Performance**: Query optimization and indexing

### Security Testing
- **Authentication**: API key validation and security
- **Input Validation**: File upload security and sanitization
- **Webhook Security**: Signature validation and HTTPS enforcement
- **Data Protection**: Ensure temporary file cleanup and data privacy

## Deployment and Configuration

### Vercel Deployment Strategy

The application will be deployed to Vercel with the following configuration:

#### Environment Variables
```env
# ElevenLabs Configuration
ELEVENLABS_API_KEY=your_api_key_here
ELEVENLABS_WEBHOOK_SECRET=your_webhook_secret

# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Application Configuration
WEBHOOK_BASE_URL=https://your-vercel-app.vercel.app
MAX_CONCURRENT_REQUESTS=4
SEGMENT_DURATION_MINUTES=15
CLEANUP_INTERVAL_HOURS=24

# Webhook Security
WEBHOOK_SIGNING_SECRET=your_signing_secret
CLIENT_WEBHOOK_TIMEOUT_MS=30000
MAX_WEBHOOK_RETRIES=5
```

#### Vercel Configuration (vercel.json)
```json
{
  "functions": {
    "src/pages/api/**/*.ts": {
      "maxDuration": 300
    }
  },
  "env": {
    "ELEVENLABS_API_KEY": "@elevenlabs-api-key",
    "SUPABASE_URL": "@supabase-url",
    "SUPABASE_SERVICE_ROLE_KEY": "@supabase-service-role-key"
  }
}
```

### Infrastructure Requirements
- **Vercel Deployment**: Next.js application with serverless functions
- **Supabase Project**: Database, storage, and Edge Functions
- **Domain Configuration**: Custom domain for webhook endpoints
- **SSL/TLS**: HTTPS enforcement for all webhook communication
- **Monitoring**: Vercel Analytics and logging integration
- **Error Tracking**: Integration with error monitoring services

### Webhook Security Implementation

#### ElevenLabs Webhook Validation
```typescript
interface WebhookValidator {
  validateElevenLabsSignature(payload: string, signature: string): boolean
  validateClientWebhookResponse(response: Response): boolean
}
```

#### Client Webhook Security
- **Request Signing**: HMAC-SHA256 signatures for outgoing webhooks
- **Retry Strategy**: Exponential backoff with jitter
- **Timeout Handling**: Configurable timeout with fallback mechanisms
- **Rate Limiting**: Prevent webhook spam and abuse

### Audio Processing Strategy for Vercel

Given Vercel's serverless limitations, the audio processing will be handled as follows:

1. **File Upload**: Next.js API route receives file and uploads to Supabase Storage
2. **Processing Trigger**: Invoke Supabase Edge Function for audio conversion/splitting
3. **Edge Function Processing**: 
   - Use FFmpeg in Deno runtime (available in Supabase Edge Functions)
   - Convert video to MP3 audio
   - Split audio into 15-minute segments
   - Upload segments back to Supabase Storage
4. **Queue Management**: Next.js API routes manage the transcription queue with webhook registration
5. **Webhook Handling**: Receive ElevenLabs results and trigger client notifications
6. **Cleanup**: Edge Functions handle file cleanup after successful webhook delivery

### Production Webhook Flow

1. **Client Request**: POST to `/api/transcribe` with file and webhook URL
2. **File Processing**: Audio conversion and segmentation via Edge Functions
3. **ElevenLabs Integration**: Submit segments with webhook URL pointing to Vercel app
4. **Result Collection**: Receive webhooks from ElevenLabs at `/api/webhook/elevenlabs`
5. **Assembly & Delivery**: Combine results and send to client webhook URL
6. **Cleanup**: Remove temporary files and update task status