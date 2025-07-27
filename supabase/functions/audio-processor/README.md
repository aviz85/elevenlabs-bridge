# Audio Processor Edge Function

This Supabase Edge Function handles audio file processing including format conversion and segmentation for the ElevenLabs Proxy Server.

## Features

- **Audio Format Conversion**: Converts various audio/video formats to MP3 using FFmpeg
- **Duration Detection**: Analyzes audio files to determine their duration
- **Audio Segmentation**: Splits long audio files into 15-minute segments for processing
- **Storage Management**: Handles file uploads and downloads from Supabase Storage
- **Database Integration**: Creates segment records in the database

## API Endpoint

**POST** `/functions/v1/audio-processor`

### Request Body

```json
{
  "taskId": "uuid-string",
  "filePath": "uploads/task-id/filename.mp3",
  "originalFilename": "original-file.mp3",
  "segmentDurationMinutes": 15
}
```

### Response

#### Success Response (200)

```json
{
  "success": true,
  "taskId": "uuid-string",
  "totalDuration": 1800,
  "segmentsCreated": 2,
  "segments": [
    {
      "id": "segment-uuid-1",
      "filePath": "segments/task-id/segment_1.mp3",
      "startTime": 0,
      "endTime": 900,
      "duration": 900
    },
    {
      "id": "segment-uuid-2", 
      "filePath": "segments/task-id/segment_2.mp3",
      "startTime": 900,
      "endTime": 1800,
      "duration": 900
    }
  ]
}
```

#### Error Response (400/500)

```json
{
  "error": "Error message describing what went wrong"
}
```

## Dependencies

- **FFmpeg**: Used for audio conversion and segmentation
- **FFprobe**: Used for audio duration detection
- **Supabase Client**: For database and storage operations

## Environment Variables

- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Service role key for database operations

## Storage Structure

The function organizes files in Supabase Storage (`audio-temp` bucket) as follows:

```
audio-temp/
├── uploads/
│   └── {taskId}/
│       └── {originalFilename}
├── converted/
│   └── {taskId}/
│       └── {filename}.mp3
└── segments/
    └── {taskId}/
        ├── segment_1.mp3
        ├── segment_2.mp3
        └── ...
```

## Database Operations

The function creates records in the following tables:

### segments table
- `id`: UUID of the segment
- `task_id`: Reference to the parent task
- `file_path`: Path to the segment file in storage
- `start_time`: Start time in seconds
- `end_time`: End time in seconds
- `status`: Initially set to 'pending'

### tasks table (updated)
- `total_segments`: Number of segments created
- `converted_file_path`: Path to converted file (for single segment files)

## Error Handling

The function handles various error scenarios:

- **File Download Errors**: When the original file cannot be downloaded from storage
- **Audio Processing Errors**: When FFmpeg/FFprobe operations fail
- **Upload Errors**: When processed files cannot be uploaded to storage
- **Database Errors**: When segment records cannot be created

## Testing

Run the Edge Function tests using Deno:

```bash
deno test supabase/functions/audio-processor/test.ts --no-check --allow-env
```

## Deployment

Deploy the Edge Function using the Supabase CLI:

```bash
supabase functions deploy audio-processor
```

## Performance Considerations

- **Memory Usage**: Large audio files are processed in chunks to manage memory
- **Processing Time**: Conversion and segmentation time scales with file size
- **Storage Limits**: Temporary files are cleaned up after processing
- **Concurrent Limits**: Multiple instances can run concurrently for different tasks

## Supported Audio Formats

Input formats supported for conversion:
- MP3, MP4, WAV, M4A, AAC, OGG, FLAC
- Video formats (MP4, MOV, AVI) - audio track extracted

Output format: MP3 (128kbps, 44.1kHz)