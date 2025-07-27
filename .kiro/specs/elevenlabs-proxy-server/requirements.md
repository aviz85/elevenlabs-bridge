# Requirements Document

## Introduction

This feature involves creating a Next.js API proxy server that acts as an intermediary for ElevenLabs' Scribe speech-to-text service. The server will handle large audio/video files by automatically splitting them into 15-minute chunks, processing them concurrently through a queue management system, and reassembling the transcription results. The system will use Supabase for database management and temporary file storage, with webhook-based communication for asynchronous processing.

## Requirements

### Requirement 1

**User Story:** As a client application, I want to send audio/video files to the proxy server, so that I can get transcribed text without worrying about file size limitations or processing complexity.

#### Acceptance Criteria

1. WHEN a client sends an audio/video file to the proxy server THEN the system SHALL accept files in common formats (mp3, mp4, wav, m4a, etc.)
2. WHEN a file is received THEN the system SHALL convert it to MP3 format to reduce file size
3. WHEN the conversion is complete THEN the system SHALL return an immediate response with a task ID for tracking
4. IF the file exceeds 15 minutes THEN the system SHALL automatically split it into 15-minute segments
5. WHEN file processing begins THEN the system SHALL store task metadata in Supabase database

### Requirement 2

**User Story:** As the proxy server, I want to manage concurrent processing of audio segments, so that I can efficiently utilize ElevenLabs API resources and minimize processing time.

#### Acceptance Criteria

1. WHEN audio segments are created THEN the system SHALL queue them for concurrent processing
2. WHEN processing segments THEN the system SHALL send multiple requests to ElevenLabs API in parallel (up to configured limit)
3. WHEN a segment is processed THEN the system SHALL store the transcription result in the database
4. IF an API request fails THEN the system SHALL implement retry logic with exponential backoff
5. WHEN all segments are processed THEN the system SHALL combine results in correct chronological order

### Requirement 3

**User Story:** As the proxy server, I want to receive webhook notifications from ElevenLabs, so that I can handle asynchronous transcription responses efficiently.

#### Acceptance Criteria

1. WHEN ElevenLabs completes a transcription THEN the system SHALL receive a webhook notification
2. WHEN a webhook is received THEN the system SHALL validate the request authenticity
3. WHEN webhook data is validated THEN the system SHALL update the corresponding task in the database
4. WHEN all segments for a task are complete THEN the system SHALL trigger result assembly
5. IF webhook processing fails THEN the system SHALL log the error and implement retry mechanisms

### Requirement 4

**User Story:** As the proxy server, I want to send completed transcriptions back to the client, so that the requesting application can receive the final results.

#### Acceptance Criteria

1. WHEN all segments are transcribed and assembled THEN the system SHALL send a webhook to the client's specified URL
2. WHEN sending client webhook THEN the system SHALL include the complete transcription text and metadata
3. WHEN client webhook is sent THEN the system SHALL include the original task ID for correlation
4. IF client webhook fails THEN the system SHALL implement retry logic with configurable attempts
5. WHEN transcription is delivered THEN the system SHALL mark the task as completed

### Requirement 5

**User Story:** As the system administrator, I want temporary files to be automatically cleaned up, so that storage costs are minimized and system performance is maintained.

#### Acceptance Criteria

1. WHEN file processing is complete THEN the system SHALL delete temporary audio segments from Supabase storage
2. WHEN transcription is successfully delivered THEN the system SHALL delete the original converted MP3 file
3. WHEN a task fails permanently THEN the system SHALL clean up associated temporary files
4. WHEN cleanup occurs THEN the system SHALL preserve task metadata and transcription results in the database
5. IF cleanup fails THEN the system SHALL log the error and schedule retry cleanup

### Requirement 6

**User Story:** As a developer integrating with the proxy server, I want clear API endpoints and authentication, so that I can easily send files and receive transcriptions.

#### Acceptance Criteria

1. WHEN making API requests THEN the system SHALL require a valid ElevenLabs API key for authentication
2. WHEN submitting a transcription request THEN the client SHALL provide a webhook URL for result delivery
3. WHEN the API receives a request THEN the system SHALL validate required parameters and file format
4. WHEN validation passes THEN the system SHALL return a structured response with task ID and status
5. IF validation fails THEN the system SHALL return appropriate error messages with HTTP status codes

### Requirement 7

**User Story:** As the proxy server, I want to track task progress and status, so that I can provide visibility into processing stages and handle errors appropriately.

#### Acceptance Criteria

1. WHEN a task is created THEN the system SHALL store initial status as "processing"
2. WHEN segments are queued THEN the system SHALL track individual segment status
3. WHEN segments complete THEN the system SHALL update progress indicators
4. WHEN errors occur THEN the system SHALL log detailed error information with task context
5. WHEN tasks complete THEN the system SHALL update final status and completion timestamp