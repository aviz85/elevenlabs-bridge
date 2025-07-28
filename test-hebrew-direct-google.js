#!/usr/bin/env node

const fs = require('fs')
const https = require('https')
const FormData = require('form-data')

// Google Cloud Function endpoint
const GOOGLE_FUNCTION_URL = 'https://us-central1-dreemz-whatsapp-mentor.cloudfunctions.net/splitAudio'
const AUDIO_FILE = './test_input/audio1436646319.m4a'
const LANGUAGE = 'heb' // Hebrew language code

console.log('🇮🇱 Testing Hebrew Audio via Google Cloud Function')
console.log('================================================')

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, options, (response) => {
      let data = ''
      
      response.on('data', (chunk) => {
        data += chunk
      })
      
      response.on('end', () => {
        try {
          const jsonData = JSON.parse(data)
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            data: jsonData
          })
        } catch (e) {
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            data: data
          })
        }
      })
    })
    
    request.on('error', reject)
    
    if (options.body) {
      if (options.body instanceof FormData) {
        options.body.pipe(request)
      } else {
        request.write(options.body)
        request.end()
      }
    } else {
      request.end()
    }
  })
}

async function testGoogleFunction() {
  console.log('\n📤 Sending Hebrew audio directly to Google Cloud Function...')
  
  if (!fs.existsSync(AUDIO_FILE)) {
    console.error(`❌ Audio file not found: ${AUDIO_FILE}`)
    return null
  }
  
  const fileStats = fs.statSync(AUDIO_FILE)
  console.log(`📁 File: ${AUDIO_FILE}`)
  console.log(`📏 Size: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`)
  console.log(`🗣️ Language: Hebrew (${LANGUAGE})`)
  
  const formData = new FormData()
  formData.append('file', fs.createReadStream(AUDIO_FILE))
  formData.append('language', LANGUAGE)
  formData.append('action', 'split_and_transcribe')
  formData.append('webhookUrl', 'https://elevenlabs-bridge-henna.vercel.app/api/webhook/elevenlabs')
  
  try {
    console.log('🚀 Sending request to Google Cloud Function...')
    
    const response = await makeRequest(GOOGLE_FUNCTION_URL, {
      method: 'POST',
      body: formData,
      headers: {
        ...formData.getHeaders()
      }
    })
    
    console.log(`📊 Response Status: ${response.statusCode}`)
    console.log(`📋 Response:`, JSON.stringify(response.data, null, 2))
    
    if (response.statusCode === 200) {
      console.log('✅ Google Cloud Function processing successful!')
      return response.data
    } else {
      console.error('❌ Google Cloud Function failed:', response.data)
      return null
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message)
    return null
  }
}

async function runGoogleTest() {
  console.log(`\n🚀 Starting Direct Google Cloud Function Test`)
  console.log(`🌐 Google Function: ${GOOGLE_FUNCTION_URL}`)
  console.log(`📁 Audio File: ${AUDIO_FILE}`)
  console.log(`🗣️ Language: Hebrew (${LANGUAGE})`)
  
  const result = await testGoogleFunction()
  
  if (result) {
    console.log('\n🎉 SUCCESS! Request sent to Google Cloud Function!')
    console.log('🔍 Check Google Cloud Function logs for processing details')
    console.log('🔍 Check Vercel webhook logs for transcription results')
  } else {
    console.log('\n💥 FAILED! Could not send to Google Cloud Function')
  }
}

// Run the test
runGoogleTest().catch(console.error) 