#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const https = require('https')
const FormData = require('form-data')

const API_BASE = 'https://elevenlabs-bridge-henna.vercel.app'
const AUDIO_FILE = './test_input/audio_short_hebrew.m4a'
const WEBHOOK_URL = 'https://httpbin.org/post'
const LANGUAGE = 'heb' // Hebrew language code

console.log('🇮🇱 Testing Hebrew Audio Processing Pipeline')
console.log('============================================')

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

async function testTranscription() {
  console.log('\n📤 Step 1: Sending Hebrew audio for transcription...')
  
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
  formData.append('webhookUrl', WEBHOOK_URL)
  formData.append('filename', path.basename(AUDIO_FILE))
  formData.append('language', LANGUAGE)
  
  try {
    const response = await makeRequest(`${API_BASE}/api/transcribe`, {
      method: 'POST',
      body: formData,
      headers: {
        ...formData.getHeaders()
      }
    })
    
    console.log(`📊 Response Status: ${response.statusCode}`)
    
    if (response.statusCode === 200) {
      console.log('✅ Transcription request accepted!')
      console.log(`🆔 Task ID: ${response.data.taskId}`)
      console.log(`📋 Status: ${response.data.status}`)
      return response.data.taskId
    } else {
      console.error('❌ Transcription failed:', response.data)
      return null
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message)
    return null
  }
}

async function checkTaskStatus(taskId) {
  console.log(`\n🔍 Step 2: Checking task status for ${taskId}...`)
  
  let attempts = 0
  const maxAttempts = 120 // 10 minutes max (5s intervals)
  
  while (attempts < maxAttempts) {
    try {
      const response = await makeRequest(`${API_BASE}/api/status/${taskId}`)
      
      if (response.statusCode === 200) {
        const task = response.data.task
        const segments = response.data.segments || []
        
        console.log(`📊 Status Check #${attempts + 1}:`)
        console.log(`   📋 Task Status: ${task.status}`)
        console.log(`   🧩 Segments: ${segments.length}`)
        
        if (segments.length > 0) {
          const segmentStatus = {}
          segments.forEach(seg => {
            segmentStatus[seg.status] = (segmentStatus[seg.status] || 0) + 1
          })
          console.log(`   📈 Segment Status:`, segmentStatus)
        }
        
        if (task.status === 'completed') {
          console.log('✅ Task completed successfully!')
          console.log(`📝 Final transcription: "${task.result?.text || 'No text'}"`)
          return { task, segments }
        } else if (task.status === 'failed') {
          console.error('❌ Task failed:', task.error_message)
          return null
        }
        
        // Still processing, wait and continue
        console.log(`⏳ Still processing... waiting 5 seconds`)
        await delay(5000)
        attempts++
      } else {
        console.error(`❌ Status check failed: ${response.statusCode}`)
        break
      }
    } catch (error) {
      console.error('❌ Status check error:', error.message)
      break
    }
  }
  
  console.log('⏰ Timeout waiting for completion')
  return null
}

async function triggerQueueProcessing() {
  console.log('\n⚙️ Step 3: Triggering queue processing...')
  
  try {
    const response = await makeRequest(`${API_BASE}/api/process-queue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    })
    
    console.log(`📊 Queue Processing Status: ${response.statusCode}`)
    if (response.statusCode === 200) {
      console.log('✅ Queue processing triggered')
      console.log(`⚙️ Processed: ${response.data.processed} jobs`)
    } else {
      console.log('⚠️ Queue processing response:', response.data)
    }
  } catch (error) {
    console.log('⚠️ Queue processing error:', error.message)
  }
}

async function runFullTest() {
  console.log(`\n🚀 Starting Hebrew Audio Processing Test`)
  console.log(`🌐 API Base: ${API_BASE}`)
  console.log(`📁 Audio File: ${AUDIO_FILE}`)
  console.log(`🗣️ Language: Hebrew (${LANGUAGE})`)
  console.log(`🔗 Webhook: ${WEBHOOK_URL}`)
  
  // Step 1: Submit transcription
  const taskId = await testTranscription()
  if (!taskId) {
    console.error('💥 Failed to submit transcription')
    return
  }
  
  // Wait a bit for processing to start
  await delay(3000)
  
  // Step 3: Trigger queue processing (important for serverless)
  await triggerQueueProcessing()
  
  // Step 2: Monitor progress
  const result = await checkTaskStatus(taskId)
  
  if (result) {
    console.log('\n🎉 SUCCESS! Hebrew transcription completed!')
    console.log('=' .repeat(50))
    console.log(`📝 Transcription: "${result.task.result?.text || 'No text'}"`)
    console.log(`🧩 Total segments: ${result.segments.length}`)
    console.log(`⏱️ Processing time: ${result.task.updated_at}`)
  } else {
    console.log('\n💥 FAILED! Transcription did not complete successfully')
  }
}

// Run the test
runFullTest().catch(console.error) 