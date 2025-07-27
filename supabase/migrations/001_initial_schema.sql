-- Create tasks table with all required fields and indexes
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_webhook_url TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  converted_file_path TEXT,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  total_segments INTEGER DEFAULT 1 CHECK (total_segments > 0),
  completed_segments INTEGER DEFAULT 0 CHECK (completed_segments >= 0),
  final_transcription TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Constraints
  CONSTRAINT completed_segments_not_exceed_total CHECK (completed_segments <= total_segments),
  CONSTRAINT completed_at_after_created_at CHECK (completed_at IS NULL OR completed_at >= created_at)
);

-- Create segments table with foreign key relationships
CREATE TABLE segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  start_time REAL NOT NULL CHECK (start_time >= 0),
  end_time REAL NOT NULL CHECK (end_time > start_time),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  transcription_text TEXT,
  elevenlabs_task_id TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Constraints
  CONSTRAINT completed_at_after_created_at CHECK (completed_at IS NULL OR completed_at >= created_at)
);

-- Create indexes for performance
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
CREATE INDEX idx_segments_task_id ON segments(task_id);
CREATE INDEX idx_segments_status ON segments(status);
CREATE INDEX idx_segments_elevenlabs_task_id ON segments(elevenlabs_task_id) WHERE elevenlabs_task_id IS NOT NULL;

-- Create composite indexes for common queries
CREATE INDEX idx_tasks_status_created_at ON tasks(status, created_at);
CREATE INDEX idx_segments_task_status ON segments(task_id, status);