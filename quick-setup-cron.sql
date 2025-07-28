-- 🚀 QUICK SETUP: Copy this SQL to Supabase Dashboard SQL Editor
-- Go to: https://supabase.com/dashboard/project/dkzhlqatscxpcdctvbmo/sql/new

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create function to call our Edge Function (replace SERVICE_ROLE_KEY)
CREATE OR REPLACE FUNCTION trigger_queue_processor()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Call the Supabase Edge Function
  PERFORM
    net.http_post(
      url := 'https://dkzhlqatscxpcdctvbmo.supabase.co/functions/v1/queue-processor',
      headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY_HERE", "Content-Type": "application/json"}',
      body := '{}'
    );
END;
$$;

-- Schedule the cron job to run every minute
SELECT cron.schedule(
  'process-elevenlabs-queue-v2',        -- job name (unique)
  '* * * * *',                          -- every minute  
  'SELECT trigger_queue_processor();'   -- function to call
);

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION trigger_queue_processor() TO service_role;

-- Check if cron job was created successfully
SELECT * FROM cron.job WHERE jobname = 'process-elevenlabs-queue-v2';

-- 📊 MANUAL TEST: Test the function directly
-- SELECT trigger_queue_processor(); 