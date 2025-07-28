const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const API_BASE_URL = 'https://elevenlabs-bridge-henna.vercel.app';
const AUDIO_FILE = 'test_input/audio1436646319.m4a';

// Get file stats
const audioFilePath = path.join(__dirname, AUDIO_FILE);
const fileStats = fs.statSync(audioFilePath);
const filename = path.basename(AUDIO_FILE);
const fileSize = fileStats.size;

console.log(`Testing API with file: ${filename}`);
console.log(`File size: ${fileSize} bytes (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

// For testing, we'll use httpbin.org which will echo back the webhook data
const WEBHOOK_URL = 'https://httpbin.org/post';

async function testTranscribeAPI() {
  const requestData = JSON.stringify({
    webhookUrl: WEBHOOK_URL,
    filename: filename,
    fileSize: fileSize
  });

  const options = {
    hostname: 'elevenlabs-bridge-henna.vercel.app',
    path: '/api/transcribe',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestData)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      console.log(`Status Code: ${res.statusCode}`);
      console.log(`Headers:`, res.headers);

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: response });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(requestData);
    req.end();
  });
}

async function checkTaskStatus(taskId) {
  const options = {
    hostname: 'elevenlabs-bridge-henna.vercel.app',
    path: `/api/status/${taskId}`,
    method: 'GET'
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: response });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

async function testHealthCheck() {
  const options = {
    hostname: 'elevenlabs-bridge-henna.vercel.app',
    path: '/api/health',
    method: 'GET'
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: response });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}

async function runTests() {
  console.log('='.repeat(50));
  console.log('TESTING DEPLOYED API');
  console.log('='.repeat(50));

  try {
    // Test health check first
    console.log('\n1. Testing Health Check...');
    const healthResult = await testHealthCheck();
    console.log('Health Check Result:', JSON.stringify(healthResult, null, 2));

    // Test transcription API
    console.log('\n2. Testing Transcription API...');
    const transcribeResult = await testTranscribeAPI();
    console.log('Transcribe Result:', JSON.stringify(transcribeResult, null, 2));

    // If we got a taskId, check the status
    if (transcribeResult.data && transcribeResult.data.taskId) {
      console.log('\n3. Testing Status Check...');
      const statusResult = await checkTaskStatus(transcribeResult.data.taskId);
      console.log('Status Result:', JSON.stringify(statusResult, null, 2));

      // Wait a bit and check status again
      console.log('\n4. Waiting 5 seconds and checking status again...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      const statusResult2 = await checkTaskStatus(transcribeResult.data.taskId);
      console.log('Status Result (after 5s):', JSON.stringify(statusResult2, null, 2));
    }

    console.log('\n='.repeat(50));
    console.log('TEST COMPLETED');
    console.log('='.repeat(50));

  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the tests
runTests(); 