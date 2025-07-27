#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { default: fetch } = require('node-fetch');

async function testWithInputFile() {
  console.log('🧪 Testing app with test_input audio file...\n');

  const audioFilePath = path.join(__dirname, 'test_input', 'audio1436646319.m4a');
  
  // Check if file exists
  if (!fs.existsSync(audioFilePath)) {
    console.error('❌ Audio file not found:', audioFilePath);
    return;
  }

  console.log('📁 Found audio file:', audioFilePath);
  const stats = fs.statSync(audioFilePath);
  console.log('📊 File size:', (stats.size / 1024 / 1024).toFixed(2), 'MB');

  try {
    // Test 1: Health check
    console.log('\n1. Testing health endpoint...');
    const healthResponse = await fetch('http://localhost:3000/api/health');
    const healthData = await healthResponse.json();
    console.log('   Health status:', healthData.status);
    
    if (healthData.status !== 'healthy') {
      console.log('   ⚠️  Server not fully healthy, but continuing with test...');
    }

    // Test 2: Start transcription (mock mode since we don't have ngrok)
    console.log('\n2. Testing transcription API...');
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioFilePath));
    formData.append('webhookUrl', 'http://localhost:3000/api/webhook/elevenlabs'); // Mock webhook
    
    console.log('   📤 Uploading file and starting transcription...');
    const transcribeResponse = await fetch('http://localhost:3000/api/transcribe-real', {
      method: 'POST',
      body: formData
    });

    const transcribeData = await transcribeResponse.json();
    
    if (!transcribeResponse.ok) {
      console.error('   ❌ Transcription failed:', transcribeData.error);
      return;
    }

    console.log('   ✅ Transcription started!');
    console.log('   📋 Task ID:', transcribeData.taskId);

    // Test 3: Poll for status
    console.log('\n3. Polling for task status...');
    let attempts = 0;
    const maxAttempts = 20; // 1 minute max
    
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`   🔄 Checking status (attempt ${attempts}/${maxAttempts})...`);
      
      const statusResponse = await fetch(`http://localhost:3000/api/status/${transcribeData.taskId}`);
      const statusData = await statusResponse.json();
      
      if (!statusResponse.ok) {
        console.error('   ❌ Status check failed:', statusData.error);
        break;
      }

      console.log(`   📊 Status: ${statusData.status} (${statusData.progress.percentage}%)`);
      console.log(`   📈 Progress: ${statusData.progress.completedSegments}/${statusData.progress.totalSegments} segments`);
      
      if (statusData.status === 'completed') {
        console.log('\n🎉 Transcription completed!');
        console.log('📝 Final transcription:');
        console.log('─'.repeat(50));
        console.log(statusData.finalTranscription || 'No transcription text available');
        console.log('─'.repeat(50));
        
        if (statusData.segments && statusData.segments.length > 0) {
          console.log('\n📋 Segments:');
          statusData.segments.forEach((segment, index) => {
            console.log(`   ${index + 1}. [${formatTime(segment.startTime)}-${formatTime(segment.endTime)}]: ${segment.transcriptionText || 'No text'}`);
          });
        }
        break;
      } else if (statusData.status === 'failed') {
        console.error('   ❌ Transcription failed:', statusData.error);
        break;
      }
      
      // Wait 3 seconds before next check
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    if (attempts >= maxAttempts) {
      console.log('   ⏰ Timeout reached. Check the status later with:');
      console.log(`   curl http://localhost:3000/api/status/${transcribeData.taskId}`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Make sure the server is running: npm run dev');
    console.log('2. Check your .env.local file has correct API keys');
    console.log('3. Verify the audio file exists in test_input/');
  }
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Run the test
testWithInputFile();