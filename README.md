# ElevenLabs Proxy Server

A Next.js API proxy server that acts as an intermediary for ElevenLabs' Scribe speech-to-text service. The server handles large audio/video files by automatically splitting them into 15-minute chunks, processing them concurrently, and reassembling the transcription results.

## Features

- **File Processing**: Automatic conversion of audio/video files to MP3 format
- **Intelligent Chunking**: Split large files into 15-minute segments for optimal processing
- **Concurrent Processing**: Queue management system for parallel API calls
- **Webhook Integration**: Asynchronous communication with ElevenLabs and client applications
- **Automatic Cleanup**: Temporary file management to minimize storage costs
- **Progress Tracking**: Real-time status updates and progress monitoring

## Tech Stack

- **Framework**: Next.js 14 with TypeScript
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage
- **Audio Processing**: Supabase Edge Functions with FFmpeg
- **External API**: ElevenLabs Scribe v1

## Getting Started

### Prerequisites

- Node.js 18+ 
- Supabase account and project
- ElevenLabs API key (for production use)

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy environment variables:
   ```bash
   cp .env.local.example .env.local
   ```

4. Update `.env.local` with your configuration:
   - Supabase URL and keys (already configured for the demo project)
   - ElevenLabs API key (optional for mock testing)
   - Webhook base URL

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) to see the test interface

### Testing with Mocks

The application includes comprehensive mock services for testing without external dependencies:

1. **Test Mock Services:**
   ```bash
   npm run test:mocks
   ```

2. **Test Webhook Simulation:**
   ```bash
   npm run test:webhook
   ```

3. **Use the Web Interface:**
   - Navigate to `http://localhost:3000`
   - Enter a webhook URL (try https://webhook.site for testing)
   - Enter a filename and file size
   - Click "Start Transcription"
   - Watch the progress and see mock results

### Testing with Real ElevenLabs API

For end-to-end testing with real audio files and the ElevenLabs API:

1. **Test ElevenLabs Connection:**
   ```bash
   npm run test:elevenlabs
   ```

2. **Set up ngrok for webhooks:**
   ```bash
   # Install ngrok globally
   npm install -g ngrok
   
   # Start your Next.js server
   npm run dev
   
   # In another terminal, start ngrok
   ngrok http 3000
   ```

3. **Use the Real API Test Interface:**
   - Navigate to `http://localhost:3000/test-real`
   - Enter your ngrok HTTPS URL (e.g., https://abc123.ngrok.io)
   - Upload a real audio/video file
   - Watch real-time processing with ElevenLabs Scribe API

4. **Monitor webhook calls:**
   - Check ngrok dashboard at `http://localhost:4040`
   - See real webhook calls from ElevenLabs
   - Monitor processing progress in real-time

### Mock Features

- **Audio Processing**: Simulates file conversion and segmentation
- **ElevenLabs API**: Mock transcription with realistic delays and responses
- **Database Operations**: Full CRUD operations with Supabase
- **Webhook Simulation**: Automatic webhook calls with mock results
- **Progress Tracking**: Real-time status updates and segment progress

## API Endpoints

### POST /api/transcribe
Upload audio/video file for transcription.

**Request:**
- `file`: Audio/video file (multipart/form-data)
- `webhookUrl`: URL to receive completion notification

**Response:**
```json
{
  "taskId": "uuid",
  "status": "processing",
  "message": "Task created successfully"
}
```

### GET /api/status/:taskId
Get transcription task status and progress.

**Response:**
```json
{
  "taskId": "uuid",
  "status": "processing",
  "progress": {
    "totalSegments": 4,
    "completedSegments": 2,
    "percentage": 50
  }
}
```

### POST /api/webhook/elevenlabs
Internal webhook endpoint for ElevenLabs notifications.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Supabase project URL | Yes |
| `SUPABASE_ANON_KEY` | Supabase anonymous key | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Yes |
| `ELEVENLABS_API_KEY` | ElevenLabs API key | Yes |
| `WEBHOOK_BASE_URL` | Base URL for webhooks | Yes |
| `MAX_CONCURRENT_REQUESTS` | Max parallel requests (default: 4) | No |
| `SEGMENT_DURATION_MINUTES` | Segment length (default: 15) | No |
| `CLEANUP_INTERVAL_HOURS` | Cleanup frequency (default: 24) | No |

## Development

### Project Structure

```
src/
├── lib/           # Core utilities and configuration
├── types/         # TypeScript type definitions
├── utils/         # Helper functions and validation
├── services/      # Business logic services
└── pages/api/     # Next.js API routes
```

### Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript compiler

## License

MIT