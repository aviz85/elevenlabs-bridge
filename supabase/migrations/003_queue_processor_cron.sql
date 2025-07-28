-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create function to call our Edge Function
CREATE OR REPLACE FUNCTION trigger_queue_processor()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Call the Supabase Edge Function using http extension
  PERFORM
    net.http_post(
      url := 'https://dkzhlqatscxpcdctvbmo.supabase.co/functions/v1/queue-processor',
      headers := '{"Authorization": "Bearer ' || current_setting('app.service_role_key') || '", "Content-Type": "application/json"}',
      body := '{}'
    );
END;
$$;

-- Schedule the cron job to run every minute
SELECT cron.schedule(
  'process-elevenlabs-queue',           -- job name
  '* * * * *',                          -- every minute  
  'SELECT trigger_queue_processor();'   -- function to call
);

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION trigger_queue_processor() TO service_role;

-- Create a log table to track cron executions (optional)
CREATE TABLE IF NOT EXISTS queue_processor_log (
  id SERIAL PRIMARY KEY,
  triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  success BOOLEAN,
  message TEXT,
  processed_jobs INTEGER,
  remaining_jobs INTEGER
);

-- Grant permissions on log table
GRANT ALL ON queue_processor_log TO service_role;
GRANT USAGE ON SEQUENCE queue_processor_log_id_seq TO service_role; 