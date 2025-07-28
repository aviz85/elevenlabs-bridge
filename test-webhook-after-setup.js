#!/usr/bin/env node

const fs = require('fs')

// Load environment variables from .env.local
function loadEnvFile() {
  try {
    const envFile = fs.readFileSync('.env.local', 'utf8')
    const lines = envFile.split('\n')
    
    lines.forEach(line => {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=')
        const value = valueParts.join('=').trim()
        process.env[key.trim()] = value
      }
    })
    console.log('✅ Environment variables loaded from .env.local')
  } catch (error) {
    console.log('⚠️ .env.local file not found')
  }
}

loadEnvFile()

console.log('🧪 TESTING ELEVENLABS WEBHOOK AFTER SETUP')
console.log('============================================')

async function testElevenLabsWebhook() {
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
  if (!ELEVENLABS_API_KEY) {
    console.error('❌ ELEVENLABS_API_KEY not defined')
    return
  }

  console.log('📋 Configuration:')
  console.log(`   API Key: ${ELEVENLABS_API_KEY.substring(0, 10)}...`)
  console.log(`   Webhook URL: https://elevenlabs-bridge-henna.vercel.app/api/webhook/elevenlabs`)
  
  // Check if test audio file exists
  const testAudioPath = './test_input/audio_short_hebrew.m4a'
  if (!fs.existsSync(testAudioPath)) {
    console.log('⚠️ Test audio file not found:', testAudioPath)
    console.log('💡 Using minimal test instead...')
    await testMinimalWebhook()
    return
  }

  console.log('\n🚀 Sending Hebrew audio to ElevenLabs with webhook...')
  
  const FormData = require('form-data')
  const form = new FormData()
  
  form.append('file', fs.createReadStream(testAudioPath))
  form.append('model_id', 'scribe_v1')
  form.append('webhook', 'true')
  form.append('language_code', 'heb')

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        ...form.getHeaders()
      },
      body: form
    })

    console.log(`📊 Response Status: ${response.status}`)
    
    const responseText = await response.text()
    console.log(`📋 Response: ${responseText}`)
    
    if (response.ok) {
      try {
        const responseData = JSON.parse(responseText)
        
        console.log('\n✅ SUCCESS! ElevenLabs accepted the request')
        
        if (responseData.request_id || responseData.task_id) {
          const id = responseData.request_id || responseData.task_id
          console.log(`📝 Task/Request ID: ${id}`)
          console.log('⏳ Waiting for webhook...')
          
          console.log('\n🔍 Monitor webhook reception:')
          console.log('1. Check Vercel logs: https://vercel.com/aviz85/elevenlabs-bridge/functions')
          console.log('2. Look for: POST /api/webhook/elevenlabs')
          console.log(`3. Search for ID: ${id}`)
          console.log('\n⏰ Webhook should arrive within 30-60 seconds...')
          
        } else {
          console.log('⚠️ No task_id or request_id in response')
          console.log('🔍 Full response:', responseData)
        }
        
      } catch (e) {
        console.log('⚠️ Response is not JSON:', responseText)
      }
    } else {
      console.log('❌ ElevenLabs API error')
      console.log('🔍 Check your API key and webhook configuration')
    }
    
  } catch (error) {
    console.log('❌ Request failed:', error.message)
  }
}

async function testMinimalWebhook() {
  console.log('\n🧪 Testing with minimal audio...')
  
  // Create minimal WAV file (1 second silence)
  const wavHeader = Buffer.from([
    0x52, 0x49, 0x46, 0x46, // "RIFF"
    0x24, 0x08, 0x00, 0x00, // file size
    0x57, 0x41, 0x56, 0x45, // "WAVE"
    0x66, 0x6D, 0x74, 0x20, // "fmt "
    0x10, 0x00, 0x00, 0x00, // format chunk size
    0x01, 0x00,             // audio format (PCM)
    0x01, 0x00,             // channels (mono)
    0x44, 0xAC, 0x00, 0x00, // sample rate (44100)
    0x88, 0x58, 0x01, 0x00, // byte rate
    0x02, 0x00,             // block align
    0x10, 0x00,             // bits per sample
    0x64, 0x61, 0x74, 0x61, // "data"
    0x00, 0x08, 0x00, 0x00  // data size
  ])
  
  const silenceData = Buffer.alloc(2048) // 2KB of silence
  const testAudio = Buffer.concat([wavHeader, silenceData])
  
  const FormData = require('form-data')
  const form = new FormData()
  
  form.append('file', testAudio, {
    filename: 'test-silence.wav',
    contentType: 'audio/wav'
  })
  form.append('model_id', 'scribe_v1')
  form.append('webhook', 'true')

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        ...form.getHeaders()
      },
      body: form
    })

    console.log(`📊 Response Status: ${response.status}`)
    const responseText = await response.text()
    console.log(`📋 Response: ${responseText}`)
    
    if (response.ok) {
      console.log('✅ Minimal test successful!')
      console.log('🔍 Check Vercel logs for webhook reception')
    }
    
  } catch (error) {
    console.log('❌ Minimal test failed:', error.message)
  }
}

async function main() {
  await testElevenLabsWebhook()
  
  console.log('\n📊 SUMMARY:')
  console.log('===========')
  console.log('1. ✅ Sent request to ElevenLabs API')
  console.log('2. ⏳ Webhook should arrive at Vercel')
  console.log('3. 🔍 Check Vercel logs to confirm reception')
  console.log('4. 📝 Look for successful webhook processing')
  
  console.log('\n💡 If webhook doesn\'t arrive:')
  console.log('   - Double-check webhook URL in ElevenLabs dashboard')
  console.log('   - Verify the webhook is enabled for speech_to_text_transcription')
  console.log('   - Check API key permissions')
}

if (require.main === module) {
  main().catch(console.error)
} 