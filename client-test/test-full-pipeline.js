const fs = require('fs');
require('dotenv').config({ path: '../.env.local' });

// ============================================
// CONFIGURATION - FILL THESE IN:
// ============================================
const VERCEL_API_URL = 'https://elevenlabs-bridge-henna.vercel.app';
const CLIENT_WEBHOOK_URL = 'https://54726c4af22e.ngrok-free.app/webhook';  // Replace with your ngrok URL
const AUDIO_FILE_PATH = '../test_input/audio_short_hebrew.m4a';

// ============================================
// MAIN TEST FUNCTION
// ============================================
async function runFullPipelineTest() {
  console.log('\n🚀 FULL PIPELINE TEST - CLIENT TO VERCEL TO ELEVENLABS');
  console.log('===========================================================');
  
  // Validation
  if (CLIENT_WEBHOOK_URL === 'YOUR_NGROK_URL_HERE/webhook') {
    console.log('❌ Please configure CLIENT_WEBHOOK_URL first!');
    console.log('1. Run: ngrok http 4000');
    console.log('2. Copy the ngrok URL and update CLIENT_WEBHOOK_URL in this file');
    return;
  }
  
  if (!fs.existsSync(AUDIO_FILE_PATH)) {
    console.log(`❌ Audio file not found: ${AUDIO_FILE_PATH}`);
    return;
  }
  
  console.log(`📡 Vercel API: ${VERCEL_API_URL}`);
  console.log(`🎯 Client Webhook: ${CLIENT_WEBHOOK_URL}`);
  console.log(`🎵 Audio File: ${AUDIO_FILE_PATH}`);
  
  try {
    // Step 1: Send transcription request to Vercel
    console.log('\n📤 STEP 1: Sending transcription request to Vercel...');
    
    const audioStats = fs.statSync(AUDIO_FILE_PATH);
    console.log(`📁 File Size: ${(audioStats.size / 1024 / 1024).toFixed(2)} MB`);
    
    const requestData = {
      webhookUrl: CLIENT_WEBHOOK_URL,
      filename: 'audio_short_hebrew.m4a',
      fileSize: audioStats.size,
      language: 'heb'
    };
    
    console.log('📋 Request Data:', JSON.stringify(requestData, null, 2));
    
    const response = await fetch(`${VERCEL_API_URL}/api/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    console.log(`📊 Response Status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ Vercel API Error: ${errorText}`);
      return;
    }
    
    const result = await response.json();
    console.log('📋 Vercel Response:');
    console.log(JSON.stringify(result, null, 2));
    
    const taskId = result.taskId;
    if (!taskId) {
      console.log('❌ No taskId returned from Vercel');
      return;
    }
    
    console.log(`✅ Task created: ${taskId}`);
    
    // Step 2: Track this task in our client server
    console.log('\n📝 STEP 2: Tracking task in client server...');
    try {
      const trackResponse = await fetch(`http://localhost:4000/track/${taskId}`, {
        method: 'POST'
      });
      
      if (trackResponse.ok) {
        const trackResult = await trackResponse.json();
        console.log(`✅ Task tracked: ${trackResult.message}`);
      } else {
        console.log('⚠️  Could not track task (client server might not be running)');
      }
    } catch (e) {
      console.log('⚠️  Could not connect to client server - make sure it\'s running on port 4000');
    }
    
    // Step 3: Monitor progress
    console.log('\n⏰ STEP 3: Monitoring task progress...');
    console.log(`🔍 Task ID: ${taskId}`);
    console.log('📡 Checking Vercel status every 15 seconds...');
    console.log('🎯 Waiting for client webhook to receive final result...');
    
    let attempts = 0;
    const maxAttempts = 40; // 10 minutes total
    
    while (attempts < maxAttempts) {
      attempts++;
      
      try {
        // Check Vercel status
        const statusResponse = await fetch(`${VERCEL_API_URL}/api/status/${taskId}`);
        
        if (statusResponse.ok) {
          const status = await statusResponse.json();
          
          console.log(`\n📊 Attempt ${attempts}/${maxAttempts} - Status Check:`);
          console.log(`  Status: ${status.status || 'unknown'}`);
          console.log(`  Progress: ${status.progress || 0}%`);
          
          if (status.segments) {
            const completed = status.segments.filter(s => s.status === 'completed').length;
            const total = status.segments.length;
            console.log(`  Segments: ${completed}/${total} completed`);
          }
          
          if (status.status === 'completed') {
            console.log('🎉 Task completed on Vercel side!');
            console.log('⏰ Waiting a bit more for client webhook...');
          }
          
          if (status.status === 'failed') {
            console.log('❌ Task failed on Vercel side');
            if (status.error) {
              console.log(`   Error: ${status.error}`);
            }
            break;
          }
        }
        
        // Check if client received webhook
        try {
          const clientResponse = await fetch('http://localhost:4000/pending');
          if (clientResponse.ok) {
            const pending = await clientResponse.json();
            if (pending.count === 0 || !pending.taskIds.includes(taskId)) {
              console.log('🎉 CLIENT WEBHOOK RECEIVED! Task completed.');
              break;
            }
          }
        } catch (e) {
          // Client server not responding
        }
        
      } catch (error) {
        console.log(`⚠️  Status check failed: ${error.message}`);
      }
      
      if (attempts < maxAttempts) {
        await sleep(15000); // Wait 15 seconds
      }
    }
    
    // Final results
    console.log('\n🎯 FINAL RESULTS:');
    console.log('==================');
    
    try {
      const finalResponse = await fetch('http://localhost:4000/results');
      if (finalResponse.ok) {
        const results = await finalResponse.json();
        
        console.log(`📊 Total webhooks received: ${results.total}`);
        
        const ourResult = results.results.find(r => r.taskId === taskId);
        if (ourResult) {
          console.log('✅ OUR TASK RESULT FOUND:');
          console.log(`   Task ID: ${ourResult.taskId}`);
          console.log(`   Status: ${ourResult.status}`);
          console.log(`   Timestamp: ${ourResult.timestamp}`);
          
          if (ourResult.transcription) {
            console.log(`   Transcription Length: ${ourResult.transcription.length} characters`);
            console.log(`   Transcription: ${ourResult.transcription.substring(0, 200)}${ourResult.transcription.length > 200 ? '...' : ''}`);
          } else {
            console.log('   No transcription received');
          }
        } else {
          console.log('❌ Our task result not found in client webhook results');
        }
      } else {
        console.log('❌ Could not get results from client server');
      }
    } catch (e) {
      console.log('❌ Could not connect to client server for results');
    }
    
    console.log('\n✅ Test completed!');
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
    console.error(error);
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// MAIN EXECUTION
// ============================================
if (require.main === module) {
  runFullPipelineTest().then(() => {
    console.log('\n🏁 Test script finished.');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Test script crashed:', error);
    process.exit(1);
  });
}

module.exports = { runFullPipelineTest }; 