const { exec } = require('child_process');
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

// Test webhook URL
const WEBHOOK_URL = 'https://httpbin.org/post';

function runCurlCommand(command, description) {
  return new Promise((resolve, reject) => {
    console.log(`\n${description}`);
    console.log(`Command: ${command}`);
    console.log('='.repeat(60));
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error.message}`);
        resolve({ error: error.message, stdout, stderr });
      } else {
        console.log('Response:');
        console.log(stdout);
        if (stderr) {
          console.log('Stderr:', stderr);
        }
        resolve({ stdout, stderr });
      }
    });
  });
}

async function runTests() {
  console.log('='.repeat(70));
  console.log('TESTING DEPLOYED API WITH CURL');
  console.log('='.repeat(70));

  // Test 1: Health Check
  await runCurlCommand(
    `curl -X GET "${API_BASE_URL}/api/health" -H "Content-Type: application/json" -w "\\nStatus: %{http_code}\\n"`,
    '1. Health Check'
  );

  // Test 2: Test with curl for transcription
  const transcribeData = JSON.stringify({
    webhookUrl: WEBHOOK_URL,
    filename: filename,
    fileSize: fileSize
  });

  await runCurlCommand(
    `curl -X POST "${API_BASE_URL}/api/transcribe" \\
      -H "Content-Type: application/json" \\
      -d '${transcribeData}' \\
      -w "\\nStatus: %{http_code}\\n"`,
    '2. Transcription Request'
  );

  // Test 3: Try a simple status check with a dummy taskId
  await runCurlCommand(
    `curl -X GET "${API_BASE_URL}/api/status/test-task-id" -H "Content-Type: application/json" -w "\\nStatus: %{http_code}\\n"`,
    '3. Status Check (with dummy task ID)'
  );

  console.log('\n' + '='.repeat(70));
  console.log('TEST COMPLETED');
  console.log('='.repeat(70));
}

runTests(); 