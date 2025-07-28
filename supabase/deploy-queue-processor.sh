#!/bin/bash

echo "🚀 DEPLOYING SUPABASE QUEUE PROCESSOR WITH CRON"

# Step 1: Deploy the Edge Function
echo ""
echo "📡 Step 1: Deploying Edge Function..."
supabase functions deploy queue-processor

# Step 2: Set environment variables for the function
echo ""
echo "🔐 Step 2: Setting environment variables..."
echo "You need to set these secrets manually:"
echo ""
echo "supabase secrets set ELEVENLABS_API_KEY=your_elevenlabs_api_key"
echo "supabase secrets set WEBHOOK_BASE_URL=https://elevenlabs-bridge-henna.vercel.app"
echo ""
echo "⚠️  IMPORTANT: Please run these commands now!"
read -p "Press Enter after you've set the secrets..."

# Step 3: Update cron migration with correct project URL
echo ""
echo "🔄 Step 3: Updating cron migration..."
echo "Please update the URL in supabase/migrations/003_queue_processor_cron.sql"
echo "Replace 'your-supabase-project.supabase.co' with your actual project URL"
echo ""
echo "You can find your project URL in your Supabase dashboard or by running:"
echo "supabase status"
echo ""
read -p "Press Enter after you've updated the URL..."

# Step 4: Run the migration
echo ""
echo "📊 Step 4: Running migration to create cron job..."
supabase db push

# Step 5: Test the function
echo ""
echo "🧪 Step 5: Testing the queue processor..."
curl -X POST "$(supabase status | grep 'API URL' | cut -d':' -f2- | xargs)/functions/v1/queue-processor" \
  -H "Authorization: Bearer $(supabase status | grep 'service_role key' | cut -d':' -f2- | xargs)" \
  -H "Content-Type: application/json" \
  -d '{}'

echo ""
echo "✅ DEPLOYMENT COMPLETE!"
echo ""
echo "🎯 The queue processor will now run automatically every minute!"
echo "📊 Check logs with: supabase functions logs queue-processor"
echo "🔍 Check cron jobs with: SELECT * FROM cron.job;" 