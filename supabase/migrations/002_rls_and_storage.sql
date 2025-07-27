-- Enable Row Level Security (RLS) on tables
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE segments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for tasks table
-- Allow service role to perform all operations (for server-side operations)
CREATE POLICY "Service role can manage tasks" ON tasks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to read their own tasks (if needed for client access)
CREATE POLICY "Users can read tasks" ON tasks
  FOR SELECT
  TO authenticated
  USING (true);

-- Create RLS policies for segments table
-- Allow service role to perform all operations
CREATE POLICY "Service role can manage segments" ON segments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to read segments (if needed for client access)
CREATE POLICY "Users can read segments" ON segments
  FOR SELECT
  TO authenticated
  USING (true);

-- Create storage bucket for temporary audio files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'audio-temp',
  'audio-temp',
  false,
  104857600, -- 100MB limit
  ARRAY[
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/mp4',
    'audio/m4a',
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo'
  ]
);

-- Create RLS policies for storage bucket
CREATE POLICY "Service role can manage audio files" ON storage.objects
  FOR ALL
  TO service_role
  USING (bucket_id = 'audio-temp')
  WITH CHECK (bucket_id = 'audio-temp');

-- Allow authenticated users to read audio files (if needed)
CREATE POLICY "Users can read audio files" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'audio-temp');