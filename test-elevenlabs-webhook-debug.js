#!/usr/bin/env node

const https = require('https')
const FormData = require('form-data')

console.log('🔍 בדיקת ElevenLabs Webhook עם Debug Endpoint')
console.log('=' .repeat(60))

// יצירת אודיו קטן (silence) לטסט
function createTestAudio() {
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
  
  const audioData = Buffer.alloc(2048, 0) // 2KB of silence
  return Buffer.concat([header, audioData])
}

async function testWithDebugEndpoint() {
  console.log('📝 יוצר אודיו טסט קטן...')
  const testAudio = createTestAudio()
  console.log(`✅ נוצר אודיו טסט: ${testAudio.length} bytes`)
  
  console.log('\n🚀 שולח ל-ElevenLabs עם debug webhook...')
  console.log('📡 Webhook URL: https://elevenlabs-bridge-henna.vercel.app/api/webhook/elevenlabs-debug')
  
  const form = new FormData()
  form.append('file', testAudio, {
    filename: 'debug-test.wav',
    contentType: 'audio/wav'
  })
  form.append('model_id', 'scribe_v1')
  form.append('webhook', 'true')
  
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
  if (!ELEVENLABS_API_KEY) {
    console.error('❌ ELEVENLABS_API_KEY לא מוגדר')
    console.log('💡 הוסף: export ELEVENLABS_API_KEY="your-key"')
    return
  }
  
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.elevenlabs.io',
      path: '/v1/speech-to-text',
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        ...form.getHeaders()
      }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        console.log(`📊 ElevenLabs תגובה: ${res.statusCode}`)
        
        try {
          const result = JSON.parse(data)
          console.log('📋 תוצאה:', JSON.stringify(result, null, 2))
          
          if (result.request_id || result.task_id) {
            const id = result.request_id || result.task_id
            console.log(`\n🎯 ID מElevenLabs: ${id}`)
            console.log('⏳ מחכה לwebhook מElevenLabs...')
            console.log('')
            console.log('🔍 מה לבדוק עכשיו:')
            console.log('1. פתח Vercel logs: https://vercel.com/aviz85/elevenlabs-bridge/functions')
            console.log('2. לחץ על "/api/webhook/elevenlabs-debug"')
            console.log(`3. חפש logs עם ID: ${id}`)
            console.log('4. תראה "🔍 ElevenLabs Debug Webhook - Full Request"')
            console.log('5. תראה את כל הנתונים שElevenLabs שולח!')
            console.log('')
            console.log('⏰ זה אמור לקחת 1-2 דקות...')
          }
          
          resolve(result)
        } catch (e) {
          console.log('📄 תגובה גולמית:', data)
          resolve({ rawResponse: data })
        }
      })
    })
    
    req.on('error', reject)
    form.pipe(req)
  })
}

async function main() {
  try {
    await testWithDebugEndpoint()
  } catch (error) {
    console.error('❌ שגיאה:', error.message)
  }
}

main() 