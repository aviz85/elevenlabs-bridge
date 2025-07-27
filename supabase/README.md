# Supabase Database Schema

This directory contains the database migrations and setup for the ElevenLabs Proxy Server.

## Schema Overview

The database consists of two main tables:

### Tasks Table
Stores information about transcription tasks submitted by clients.

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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);
```

### Segments Table
Stores information about individual audio segments created from splitting larger files.

```sql
CREATE TABLE segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  start_time REAL NOT NULL,
  end_time REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  transcription_text TEXT,
  elevenlabs_task_id TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);
```

## Storage Bucket

The schema also creates a storage bucket for temporary audio files:

- **Bucket Name**: `audio-temp`
- **Public Access**: Disabled (private bucket)
- **File Size Limit**: 100MB
- **Allowed MIME Types**: Audio and video formats (mp3, mp4, wav, m4a, etc.)

## Row Level Security (RLS)

Both tables have RLS enabled with policies that:
- Allow full access to the service role (for server-side operations)
- Allow read access to authenticated users (for potential client access)

## Indexes

Performance indexes are created for:
- Task status and creation date
- Segment task relationships and status
- ElevenLabs task ID lookups

## Migration Files

1. **001_initial_schema.sql**: Creates tables, constraints, and indexes
2. **002_rls_and_storage.sql**: Sets up RLS policies and storage bucket

## Setup Instructions

1. Ensure your Supabase project is configured with the correct environment variables
2. Run the migrations in order using the Supabase CLI or dashboard
3. Verify the setup using the setup script: `npx ts-node src/scripts/setup.ts`

## Environment Variables Required

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Testing

Database operations are tested in `src/services/__tests__/database.test.ts` with comprehensive unit tests covering all CRUD operations and error scenarios.