# ElevenLabs Client Test - End-to-End Pipeline

🎯 **בדיקה מקצה לקצה של כל התהליך מהקליינט דרך Vercel ל-ElevenLabs וחזרה**

## 📋 Overview

התהליך המלא:
```
Client -> Vercel -> Google Cloud Functions -> ElevenLabs -> Vercel -> Client Webhook
```

1. **Client** שולח קובץ אודיו ל-Vercel 
2. **Vercel** מעביר ל-Google Cloud Functions לפיצול
3. **Google Cloud Functions** מפצל לsegments ושולח ל-ElevenLabs
4. **ElevenLabs** מחזיר webhook לכל segment ל-Vercel
5. **Vercel** מרכיב את התוצאות ושולח webhook ל-Client

## 🚀 Quick Start

### 1. התקנה
```bash
cd client-test
npm install
```

### 2. הגדרת ngrok
```bash
# Terminal 1 - Start ngrok
ngrok http 4000
```

### 3. עדכון כתובת Webhook
Copy the ngrok URL and update `CLIENT_WEBHOOK_URL` in `test-full-pipeline.js`:
```javascript
const CLIENT_WEBHOOK_URL = 'https://your-ngrok-url.ngrok.io/webhook';
```

### 4. הרצת השרת
```bash
# Terminal 2 - Start client server
npm start
```

### 5. הרצת הטסט
```bash
# Terminal 3 - Run the test
npm test
```

## 📊 Server Endpoints

### Client Server (http://localhost:4000)

- `GET /` - Server status and stats
- `POST /webhook` - Receives final results from Vercel
- `GET /results` - View all received results
- `GET /pending` - View pending tasks
- `POST /clear` - Clear all results
- `POST /track/:taskId` - Track a specific task

### Usage Examples

```bash
# Check server status
curl http://localhost:4000/

# View results
curl http://localhost:4000/results

# Clear all results
curl -X POST http://localhost:4000/clear
```

## 🔍 Monitoring

The test will:
- ✅ Send audio file to Vercel
- ✅ Track the task progress
- ✅ Monitor Vercel status every 15 seconds
- ✅ Wait for client webhook to receive final result
- ✅ Display full transcription when complete

## 📝 Files Generated

- `transcription-results.json` - Persistent storage of all webhook results

## 🛠️ Troubleshooting

### Server won't start
```bash
# Check if port 4000 is in use
lsof -i :4000

# Kill process if needed
kill -9 <PID>
```

### ngrok URL not working
- Make sure ngrok is running on port 4000
- Update the CLIENT_WEBHOOK_URL in test script
- Check ngrok dashboard for request logs

### Test fails
- Check Vercel logs for errors
- Verify Supabase environment variables in Vercel
- Check ElevenLabs API key and webhook configuration

## 📊 Expected Output

```
🚀 FULL PIPELINE TEST - CLIENT TO VERCEL TO ELEVENLABS
===========================================================
📡 Vercel API: https://elevenlabs-bridge-henna.vercel.app
🎯 Client Webhook: https://abc123.ngrok.io/webhook
🎵 Audio File: ../test_input/audio_short_hebrew.m4a
📁 File Size: 1.23 MB

📤 STEP 1: Sending transcription request to Vercel...
📊 Response Status: 200
📋 Vercel Response:
{
  "taskId": "uuid-here",
  "status": "processing",
  "message": "Transcription started"
}
✅ Task created: uuid-here

📝 STEP 2: Tracking task in client server...
✅ Task tracked: Tracking task uuid-here

⏰ STEP 3: Monitoring task progress...
🔍 Task ID: uuid-here
📡 Checking Vercel status every 15 seconds...
🎯 Waiting for client webhook to receive final result...

📊 Attempt 1/40 - Status Check:
  Status: processing
  Progress: 25%
  Segments: 2/8 completed

🎉 WEBHOOK RECEIVED FROM VERCEL!
=====================================
⏰ Time: 2025-07-28T14:00:00.000Z
📄 WEBHOOK DATA:
{
  "taskId": "uuid-here",
  "status": "completed",
  "transcription": "המשפט הזה בעברית...",
  "finalTranscription": "המשפט הזה בעברית..."
}

🎯 FINAL RESULTS:
==================
📊 Total webhooks received: 1
✅ OUR TASK RESULT FOUND:
   Task ID: uuid-here
   Status: completed
   Timestamp: 2025-07-28T14:00:00.000Z
   Transcription Length: 1234 characters
   Transcription: המשפט הזה בעברית...

✅ Test completed!
```

## 🔧 Configuration

Make sure these are set in Vercel:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` 
- `SUPABASE_SERVICE_ROLE_KEY`
- `ELEVENLABS_API_KEY`
- `WEBHOOK_BASE_URL` 