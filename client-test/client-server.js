const express = require('express');
const fs = require('fs');
require('dotenv').config({ path: '../.env.local' });

// ============================================
// CONFIGURATION
// ============================================
const PORT = 4000;
const app = express();

// Store results
let transcriptionResults = [];
let pendingTasks = new Set();

// ============================================
// MIDDLEWARE
// ============================================
app.use(express.json({ limit: '10mb' }));
app.use(express.raw({ 
  type: 'application/json', 
  limit: '10mb',
  verify: (req, res, buf, encoding) => {
    req.rawBody = buf;
  }
}));

// ============================================
// WEBHOOK ENDPOINT - Receives results from Vercel
// ============================================
app.post('/webhook', (req, res) => {
  console.log('\n🎉 WEBHOOK RECEIVED FROM VERCEL!');
  console.log('=====================================');
  
  const timestamp = new Date().toISOString();
  console.log(`⏰ Time: ${timestamp}`);
  
  // Log headers
  console.log('\n📋 HEADERS:');
  Object.keys(req.headers).forEach(key => {
    console.log(`  ${key}: ${req.headers[key]}`);
  });
  
  // Parse body
  let webhookData;
  try {
    webhookData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    console.log('\n📄 WEBHOOK DATA:');
    console.log(JSON.stringify(webhookData, null, 2));
  } catch (e) {
    console.log('\n❌ Failed to parse webhook body:', e.message);
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  
  // Extract task info
  const taskId = webhookData.taskId || webhookData.task_id || 'unknown';
  const status = webhookData.status || 'unknown';
  const transcription = webhookData.transcription || webhookData.finalTranscription;
  
  console.log('\n🔍 EXTRACTED INFO:');
  console.log(`  Task ID: ${taskId}`);
  console.log(`  Status: ${status}`);
  console.log(`  Has Transcription: ${!!transcription}`);
  
  if (transcription) {
    console.log(`  Transcription Length: ${transcription.length} characters`);
    console.log(`  Transcription Preview: ${transcription.substring(0, 100)}...`);
  }
  
  // Store result
  const result = {
    timestamp,
    taskId,
    status,
    transcription,
    fullWebhook: webhookData
  };
  
  transcriptionResults.push(result);
  
  // Remove from pending if exists
  if (pendingTasks.has(taskId)) {
    pendingTasks.delete(taskId);
    console.log(`✅ Task ${taskId} completed! Removed from pending.`);
  }
  
  // Save to file for persistence
  try {
    fs.writeFileSync('transcription-results.json', JSON.stringify(transcriptionResults, null, 2));
    console.log('💾 Results saved to transcription-results.json');
  } catch (e) {
    console.log('⚠️  Failed to save results:', e.message);
  }
  
  console.log('\n🎯 SUMMARY:');
  console.log(`  Total Results Received: ${transcriptionResults.length}`);
  console.log(`  Pending Tasks: ${pendingTasks.size}`);
  
  res.status(200).json({ 
    message: 'Webhook received successfully',
    taskId,
    timestamp,
    processed: true
  });
});

// ============================================
// STATUS ENDPOINTS
// ============================================
app.get('/', (req, res) => {
  res.json({
    message: 'ElevenLabs Client Test Server',
    status: 'running',
    port: PORT,
    endpoints: {
      webhook: '/webhook',
      results: '/results',
      pending: '/pending',
      clear: '/clear'
    },
    stats: {
      totalResults: transcriptionResults.length,
      pendingTasks: pendingTasks.size,
      pendingTaskIds: Array.from(pendingTasks)
    }
  });
});

app.get('/results', (req, res) => {
  res.json({
    total: transcriptionResults.length,
    results: transcriptionResults
  });
});

app.get('/pending', (req, res) => {
  res.json({
    count: pendingTasks.size,
    taskIds: Array.from(pendingTasks)
  });
});

app.post('/clear', (req, res) => {
  transcriptionResults = [];
  pendingTasks.clear();
  try {
    fs.unlinkSync('transcription-results.json');
  } catch (e) {
    // File might not exist
  }
  res.json({ message: 'Results cleared' });
});

// Track new pending task
app.post('/track/:taskId', (req, res) => {
  const taskId = req.params.taskId;
  pendingTasks.add(taskId);
  console.log(`📝 Now tracking task: ${taskId}`);
  res.json({ message: `Tracking task ${taskId}`, pendingCount: pendingTasks.size });
});

// ============================================
// START SERVER
// ============================================
const server = app.listen(PORT, () => {
  console.log('\n🎯 ELEVENLABS CLIENT TEST SERVER');
  console.log('=====================================');
  console.log(`🌐 Server running on: http://localhost:${PORT}`);
  console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhook`);
  console.log(`📊 Results endpoint: http://localhost:${PORT}/results`);
  console.log(`🗂️  Status endpoint: http://localhost:${PORT}/`);
  
  console.log('\n📋 SETUP INSTRUCTIONS:');
  console.log('1. Open another terminal and run: ngrok http 4000');
  console.log('2. Copy the ngrok URL (e.g., https://abc123.ngrok.io)');
  console.log('3. Use that URL + /webhook as the webhook URL for testing');
  console.log('4. Run: npm run test');
  
  console.log('\n⏰ Ready to receive webhooks...\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down client server...');
  server.close(() => {
    console.log('✅ Server closed.');
    process.exit(0);
  });
});

module.exports = { app, server }; 