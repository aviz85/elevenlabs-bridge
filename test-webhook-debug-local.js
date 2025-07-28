const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const FormData = require('form-data');
require('dotenv').config({ path: '.env.local' });

// ============================================
// CONFIGURATION - FILL THESE IN:
// ============================================
const WEBHOOK_URL = 'https://02f2e5bc676d.ngrok-free.app/webhook-debug';  // Replace with your ngrok URL
const WEBHOOK_SECRET = 'wsec_104a57220a2a6cb8f6a5b1b5c19ddaf903a3505dd98c693d51fba351c8dc4049';        // Replace with your webhook secret
const PORT = 3001;

// ============================================
// LOCAL EXPRESS SERVER FOR WEBHOOK DEBUGGING
// ============================================
const app = express();

// Middleware to capture raw body - more comprehensive
app.use('/webhook-debug', express.raw({ 
  type: '*/*', 
  limit: '10mb',
  verify: (req, res, buf, encoding) => {
    // Store both raw buffer and string version
    req.rawBody = buf;
    req.rawBodyString = buf.toString('utf8');
  }
}));
app.use(express.json());

let webhookData = null;

// Webhook endpoint that captures everything
app.post('/webhook-debug', (req, res) => {
  console.log('\n🎉 WEBHOOK RECEIVED!');
  console.log('=====================================');
  
  // Use the better captured raw body
  const rawBody = req.rawBody || req.body;
  const bodyString = req.rawBodyString || rawBody.toString();
  
  console.log('📋 HEADERS:');
  Object.keys(req.headers).forEach(key => {
    console.log(`  ${key}: ${req.headers[key]}`);
  });
  
  console.log('\n📄 RAW BODY:');
  console.log(bodyString);
  
  console.log('\n🔍 PARSED BODY:');
  try {
    const parsedBody = JSON.parse(bodyString);
    console.log(JSON.stringify(parsedBody, null, 2));
  } catch (e) {
    console.log('Could not parse as JSON:', e.message);
  }
  
  // Extract signature
  const signature = req.headers['elevenlabs-signature'] || req.headers['x-elevenlabs-signature'];
  console.log('\n🔐 SIGNATURE ANALYSIS:');
  console.log(`Signature header: ${signature}`);
  console.log(`Raw body length: ${bodyString.length} bytes`);
  const bodyPreview = bodyString.length > 200 ? bodyString.substring(0, 200) + '...' : bodyString;
  console.log(`Body preview: ${bodyPreview}`);
  
  if (signature && WEBHOOK_SECRET !== 'YOUR_WEBHOOK_SECRET_HERE') {
    analyzeSignature(signature, bodyString, WEBHOOK_SECRET);
  } else {
    console.log('⚠️  No signature found or secret not configured');
  }
  
  // Store for analysis
  webhookData = {
    headers: req.headers,
    body: bodyString,
    signature: signature,
    timestamp: new Date().toISOString()
  };
  
  res.status(200).json({ 
    message: 'Webhook received successfully',
    timestamp: new Date().toISOString()
  });
});

// Analysis endpoint
app.get('/analysis', (req, res) => {
  if (!webhookData) {
    return res.json({ message: 'No webhook data received yet' });
  }
  
  res.json({
    message: 'Latest webhook analysis',
    data: webhookData,
    signatureAnalysis: webhookData.signature ? 
      analyzeSignature(webhookData.signature, webhookData.body, WEBHOOK_SECRET, true) : 
      'No signature to analyze'
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'ElevenLabs Webhook Debug Server',
    endpoints: {
      webhook: '/webhook-debug',
      analysis: '/analysis'
    },
    status: webhookData ? 'Webhook received' : 'Waiting for webhook'
  });
});

// ============================================
// SIGNATURE ANALYSIS FUNCTION
// ============================================
function analyzeSignature(signature, payload, secret, returnResult = false) {
  const result = {
    originalSignature: signature,
    parsed: {},
    validationResults: [],
    recommendations: []
  };
  
  console.log(`Original signature: ${signature}`);
  
  // Parse signature format: t=timestamp,v0=hash
  try {
    const parts = signature.split(',');
    let timestamp = null;
    let signatureValue = null;
    
    for (const part of parts) {
      const [key, value] = part.trim().split('=');
      if (key === 't') {
        timestamp = value;
        result.parsed.timestamp = timestamp;
      } else if (key === 'v0') {
        signatureValue = value;
        result.parsed.signatureValue = signatureValue;
      }
    }
    
    console.log(`Parsed timestamp: ${timestamp}`);
    console.log(`Parsed signature: ${signatureValue}`);
    
    if (!timestamp || !signatureValue) {
      console.log('❌ Invalid signature format');
      result.validationResults.push('Invalid signature format');
      if (!timestamp) result.recommendations.push('Missing timestamp (t=...)');
      if (!signatureValue) result.recommendations.push('Missing signature value (v0=...)');
      if (returnResult) return result;
      return;
    }
    
    // Test different payload combinations
    const payloadVariants = [
      { name: 'timestamp.payload', value: `${timestamp}.${payload}` },
      { name: 'timestamp+payload', value: `${timestamp}${payload}` },
      { name: 'payload only', value: payload },
      { name: 'timestamp only', value: timestamp },
      // Additional variants for ElevenLabs
      { name: 'timestamp.payload (Buffer)', value: Buffer.from(`${timestamp}.${payload}`, 'utf8') },
      { name: 'timestamp+payload (Buffer)', value: Buffer.from(`${timestamp}${payload}`, 'utf8') },
      { name: 'payload (Buffer)', value: Buffer.from(payload, 'utf8') },
      // Try without BOM or special characters
      { name: 'timestamp.payload (clean)', value: `${timestamp}.${payload.replace(/\uFEFF/g, '')}` },
      { name: 'timestamp.payload (latin1)', value: Buffer.from(`${timestamp}.${payload}`, 'latin1').toString('utf8') }
    ];
    
    console.log('\n🧪 TESTING DIFFERENT HMAC combinations:');
    
    for (const variant of payloadVariants) {
      try {
        const hmac = crypto.createHmac('sha256', secret);
        
        // Handle both Buffer and string inputs
        if (Buffer.isBuffer(variant.value)) {
          hmac.update(variant.value);
        } else {
          hmac.update(variant.value, 'utf8');
        }
        
        const expectedSignature = hmac.digest('hex');
        const isValid = signatureValue === expectedSignature;
        
        console.log(`\n${variant.name}:`);
        console.log(`  Payload to sign: ${Buffer.isBuffer(variant.value) ? '[Buffer]' : `"${variant.value.substring(0, 100)}${variant.value.length > 100 ? '...' : ''}"`}`);
        console.log(`  Payload length: ${Buffer.isBuffer(variant.value) ? variant.value.length : variant.value.length}`);
        console.log(`  Expected: ${expectedSignature}`);
        console.log(`  Received: ${signatureValue}`);
        console.log(`  Valid: ${isValid ? '✅' : '❌'}`);
        
        result.validationResults.push({
          method: variant.name,
          payloadToSign: Buffer.isBuffer(variant.value) ? '[Buffer]' : variant.value.substring(0, 200),
          expectedSignature,
          receivedSignature: signatureValue,
          isValid
        });
        
        if (isValid) {
          console.log(`\n🎉 FOUND CORRECT METHOD: ${variant.name}`);
          result.correctMethod = variant.name;
          result.correctPayload = variant.value;
        }
      } catch (error) {
        console.log(`\n❌ Error testing ${variant.name}: ${error.message}`);
      }
    }
    
    // Additional debugging info
    console.log('\n🔍 DEBUGGING INFO:');
    console.log(`Secret length: ${secret.length}`);
    console.log(`Secret starts with: ${secret.substring(0, 10)}...`);
    console.log(`Payload length: ${payload.length}`);
    console.log(`Payload type: ${typeof payload}`);
    console.log(`Payload starts with: ${payload.substring(0, 100)}...`);
    console.log(`Timestamp: ${timestamp} (${new Date(parseInt(timestamp) * 1000).toISOString()})`);
    console.log(`Timestamp type: ${typeof timestamp}`);
    
    // Test if the secret might be base64 encoded
    try {
      const secretBuffer = Buffer.from(secret, 'base64');
      if (secretBuffer.length > 10 && secretBuffer.length < 100) {
        console.log(`\n🧪 Testing with base64-decoded secret...`);
        const testSignature = crypto
          .createHmac('sha256', secretBuffer)
          .update(`${timestamp}.${payload}`, 'utf8')
          .digest('hex');
        console.log(`Base64 secret test: ${testSignature === signatureValue ? '✅' : '❌'}`);
      }
    } catch (e) {
      // Secret is not base64
    }
    
  } catch (error) {
    console.log('❌ Error analyzing signature:', error.message);
    result.error = error.message;
  }
  
  if (returnResult) return result;
}

// ============================================
// ELEVENLABS TEST FUNCTION
// ============================================
async function testElevenLabsWebhook() {
  console.log('\n🧪 TESTING ELEVENLABS WEBHOOK');
  console.log('=====================================');
  
  // Validation
  if (WEBHOOK_URL === 'YOUR_NGROK_URL_HERE/webhook-debug') {
    console.log('❌ Please configure WEBHOOK_URL first!');
    return;
  }
  
  if (!process.env.ELEVENLABS_API_KEY) {
    console.log('❌ ELEVENLABS_API_KEY not found in .env.local');
    return;
  }
  
  console.log(`📡 Webhook URL: ${WEBHOOK_URL}`);
  console.log(`🔐 Secret configured: ${WEBHOOK_SECRET !== 'YOUR_WEBHOOK_SECRET_HERE'}`);
  console.log(`🎤 API Key: ${process.env.ELEVENLABS_API_KEY.substring(0, 10)}...`);
  
  try {
    // Use real audio file from test_input
    const audioPath = './test_input/audio_short_hebrew.m4a';
    
    if (!fs.existsSync(audioPath)) {
      console.log('❌ Audio file not found:', audioPath);
      return;
    }
    
    const audioBuffer = fs.readFileSync(audioPath);
    console.log(`📁 Using audio file: ${audioPath} (${audioBuffer.length} bytes)`);
    
    // Prepare form data
    const formData = new FormData();
    formData.append('model_id', 'scribe_v1');
    formData.append('file', audioBuffer, { 
      filename: 'audio_short_hebrew.m4a', 
      contentType: 'audio/mp4' 
    });
    formData.append('webhook', 'true');
    formData.append('language_code', 'heb');
    
    console.log('📝 Form fields prepared:');
    console.log('  - model_id: scribe_v1');
    console.log('  - file: audio_short_hebrew.m4a');
    console.log('  - webhook: true');
    console.log('  - language_code: heb');
    
    console.log('\n🚀 Sending to ElevenLabs Speech-to-Text...');
    
    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        ...formData.getHeaders()
      },
      body: formData
    });
    
    console.log(`📊 Response Status: ${response.status}`);
    
    const responseText = await response.text();
    console.log(`📋 Response: ${responseText}`);
    
    if (response.ok) {
      console.log('\n✅ Request sent successfully!');
      console.log('🔄 Waiting for webhook... Check your ngrok terminal and this server logs');
      
      try {
        const responseData = JSON.parse(responseText);
        if (responseData.request_id) {
          console.log(`📝 Request ID: ${responseData.request_id}`);
        }
      } catch (e) {
        // Response might not be JSON
      }
    } else {
      console.log('❌ ElevenLabs API error');
    }
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

// ============================================
// START SERVER AND INSTRUCTIONS
// ============================================
function startServer() {
  const server = app.listen(PORT, () => {
    console.log('\n🎯 ELEVENLABS WEBHOOK DEBUG SERVER');
    console.log('=====================================');
    console.log(`🌐 Server running on: http://localhost:${PORT}`);
    console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhook-debug`);
    console.log(`📊 Analysis endpoint: http://localhost:${PORT}/analysis`);
    
    console.log('\n📋 SETUP INSTRUCTIONS:');
    console.log('1. Open another terminal and run: ngrok http 3001');
    console.log('2. Copy the ngrok URL (e.g., https://abc123.ngrok.io)');
    console.log('3. Update WEBHOOK_URL in this file to: YOUR_NGROK_URL/webhook-debug');
    console.log('4. Configure your webhook secret in WEBHOOK_SECRET');
    console.log('5. Run: node test-webhook-debug-local.js test');
    console.log('\n⏰ Waiting for webhook...\n');
  });
  
  return server;
}

// ============================================
// MAIN EXECUTION
// ============================================
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('test')) {
    // Just send the test request
    testElevenLabsWebhook();
  } else {
    // Start the server
    startServer();
  }
} 