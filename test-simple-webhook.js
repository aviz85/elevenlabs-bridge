#!/usr/bin/env node

const fs = require('fs')

// Load environment variables
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
} catch (e) {
  console.log('⚠️ Failed to load .env.local')
}

console.log('🧪 SIMPLE ELEVENLABS WEBHOOK TEST')
console.log('=================================')

async function testSimpleWebhook() {
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
  if (!ELEVENLABS_API_KEY) {
    console.error('❌ ELEVENLABS_API_KEY not defined')
    return
  }

  console.log(`📋 API Key: ${ELEVENLABS_API_KEY.substring(0, 10)}...`)
  console.log('🧪 Creating minimal WAV audio...')
  
  // Create minimal WAV file (1 second silence)
  const header = Buffer.from([
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
  const testAudio = Buffer.concat([header, silenceData])
  
  console.log(`✅ Created ${testAudio.length} bytes WAV file`)
  
  const FormData = require('form-data')
  const form = new FormData()
  
  form.append('file', testAudio, {
    filename: 'test-silence.wav',
    contentType: 'audio/wav'
  })
  form.append('model_id', 'scribe_v1')
  form.append('webhook', 'true')

  console.log('\n🚀 Sending to ElevenLabs...')
  
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
    console.log(`📋 Response Body: ${responseText}`)
    
    if (response.ok) {
      console.log('\n✅ SUCCESS! ElevenLabs accepted the request')
      
      try {
        const responseData = JSON.parse(responseText)
        
        if (responseData.request_id || responseData.task_id) {
          const id = responseData.request_id || responseData.task_id
          console.log(`📝 Received ID: ${id}`)
          console.log('⏳ Webhook should arrive soon at Vercel!')
          console.log('\n🔍 Check Vercel logs:')
          console.log('   https://vercel.com/aviz85/elevenlabs-bridge/functions')
          console.log(`   Look for: POST /api/webhook/elevenlabs with ID: ${id}`)
          
          return true
        } else {
          console.log('⚠️ No ID in response')
          console.log('📄 Full response:', responseData)
        }
        
      } catch (e) {
        console.log('⚠️ Response is not JSON:', responseText)
      }
    } else {
      console.log('❌ ElevenLabs API error')
      console.log('💡 Common issues:')
      console.log('   - API key incorrect or expired')
      console.log('   - Audio format not supported')
      console.log('   - Webhook not configured in dashboard')
    }
    
  } catch (error) {
    console.log('❌ Request failed:', error.message)
  }
  
  return false
}

async function main() {
  console.log('🎯 Testing webhook configuration...\n')
  
  const success = await testSimpleWebhook()
  
  console.log('\n📊 RESULT:')
  console.log('==========')
  
  if (success) {
    console.log('✅ Test passed! Webhook should be working')
    console.log('🎉 Ready for full end-to-end test!')
    console.log('\n➡️  Next: cd client-test && npm test')
  } else {
    console.log('❌ Test failed - check configuration')
    console.log('\n🔧 Troubleshooting:')
    console.log('1. Verify API key in .env.local')
    console.log('2. Check webhook URL in ElevenLabs dashboard')
    console.log('3. Ensure webhook is enabled for speech_to_text_transcription')
  }
}

if (require.main === module) {
  main().catch(console.error)
} 