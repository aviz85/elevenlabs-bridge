#!/usr/bin/env node

const https = require('https')
const fs = require('fs')
const FormData = require('form-data')

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
    console.log('✅ טעינת משתני סביבה מ-.env.local')
  } catch (error) {
    console.log('⚠️ לא נמצא קובץ .env.local')
  }
}

// Load environment variables
loadEnvFile()

console.log('🧪 בדיקת ElevenLabs Webhook ישירה')
console.log('=' .repeat(50))

// יצירת אודיו קטן (silence) לטסט
function createTestAudio() {
  // צור קובץ WAV קטן (1 שנייה silence) 
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
  
  // 1 שנייה של silence (44100 samples * 2 bytes = 88200 bytes, but we'll use small size for test)
  const audioData = Buffer.alloc(2048, 0) // 2KB of silence
  
  return Buffer.concat([header, audioData])
}

async function testElevenLabsWebhook() {
  console.log('📝 יוצר אודיו טסט קטן...')
  const testAudio = createTestAudio()
  console.log(`✅ נוצר אודיו טסט: ${testAudio.length} bytes`)
  
  console.log('\n🚀 שולח ל-ElevenLabs עם webhook...')
  
  const form = new FormData()
  form.append('file', testAudio, {
    filename: 'test-webhook.wav',
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
          
          if (result.task_id) {
            console.log(`\n🎯 Task ID מElevenLabs: ${result.task_id}`)
            console.log('⏳ מחכה לwebhook מElevenLabs...')
            console.log('🔍 בדוק logs ב-Vercel: https://vercel.com/aviz85/elevenlabs-bridge/functions')
            console.log('📡 מחפש logs של: POST /api/webhook/elevenlabs')
            console.log(`🏷️  עם task_id: ${result.task_id}`)
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

async function checkWebhookEndpoint() {
  console.log('\n🔍 בודק שwebhook endpoint נגיש...')
  
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'elevenlabs-bridge-henna.vercel.app',
      path: '/api/webhook/elevenlabs',
      method: 'GET'
    }, (res) => {
      console.log(`📊 Webhook endpoint: ${res.statusCode}`)
      if (res.statusCode === 405) {
        console.log('✅ Endpoint קיים (405 = Method Not Allowed for GET)')
      } else {
        console.log(`⚠️  תגובה לא צפויה: ${res.statusCode}`)
      }
      resolve()
    })
    
    req.on('error', (err) => {
      console.error('❌ Webhook endpoint לא נגיש:', err.message)
      resolve()
    })
    
    req.end()
  })
}

async function main() {
  try {
    // Step 1: Check webhook endpoint
    await checkWebhookEndpoint()
    
    // Step 2: Test ElevenLabs with webhook
    const result = await testElevenLabsWebhook()
    
    if (result.task_id) {
      console.log('\n' + '='.repeat(50))
      console.log('📋 מה לבדוק עכשיו:')
      console.log('1. 🔍 פתח Vercel logs: https://vercel.com/aviz85/elevenlabs-bridge/functions')
      console.log('2. 📡 לחץ על "/api/webhook/elevenlabs"')
      console.log(`3. 🏷️  חפש logs עם task_id: ${result.task_id}`)
      console.log('4. ✅ אם רואה "elevenlabs-webhook-received" - הwebhook עובד!')
      console.log('5. ❌ אם אין logs - הwebhook לא הגיע')
      
      console.log('\n⏰ אחרי 1-2 דקות אמור להגיע webhook מElevenLabs')
    }
    
  } catch (error) {
    console.error('❌ שגיאה:', error.message)
  }
}

main() 