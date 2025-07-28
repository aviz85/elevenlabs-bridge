#!/usr/bin/env node

/**
 * 🧪 QUICK TEST: Supabase Queue Processor
 * Tests the full pipeline with Supabase cron
 */

const VERCEL_API_URL = 'https://elevenlabs-bridge-henna.vercel.app'
const CLIENT_WEBHOOK_URL = 'http://localhost:4000/webhook'  // Your ngrok URL here
const AUDIO_FILE_PATH = './test_input/audio_short_hebrew.m4a'

async function testSupabaseQueue() {
  console.log('🚀 TESTING SUPABASE QUEUE PROCESSOR PIPELINE!')
  console.log('=' .repeat(60))

  try {
    // Step 1: Start transcription
    console.log('\n📤 Step 1: Starting transcription...')
    const requestData = {
      webhookUrl: CLIENT_WEBHOOK_URL,
      filename: 'audio_short_hebrew.m4a',
      fileSize: 1230000, // ~1.23MB
      language: 'heb'
    }

    const response = await fetch(`${VERCEL_API_URL}/api/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`)
    }

    const result = await response.json()
    const taskId = result.taskId

    console.log('✅ Transcription started!')
    console.log(`📋 Task ID: ${taskId}`)

    // Step 2: Monitor progress
    console.log('\n⏱️  Step 2: Monitoring progress...')
    console.log('🤖 Supabase cron should process segments automatically every minute!')
    
    let attempts = 0
    const maxAttempts = 10
    
    while (attempts < maxAttempts) {
      attempts++
      console.log(`\n🔄 Check ${attempts}/${maxAttempts}...`)
      
      // Check Vercel status
      const statusResponse = await fetch(`${VERCEL_API_URL}/api/status/${taskId}`)
      if (!statusResponse.ok) {
        console.log(`❌ Status check failed: ${statusResponse.status}`)
        continue
      }
      
      const status = await statusResponse.json()
      console.log(`📊 Progress: ${status.progress.completedSegments}/${status.progress.totalSegments} (${status.progress.percentage}%)`)
      console.log(`🎯 Status: ${status.status}`)
      
      // Show segment details
      const segmentStats = status.segments.reduce((acc, seg) => {
        acc[seg.status] = (acc[seg.status] || 0) + 1
        return acc
      }, {})
      console.log(`📈 Segments: ${JSON.stringify(segmentStats)}`)
      
      // Check if completed
      if (status.status === 'completed') {
        console.log('\n🎉 TRANSCRIPTION COMPLETED!')
        console.log(`📝 Final text length: ${status.finalTranscription?.length || 0} chars`)
        console.log(`⏰ Completed at: ${status.completedAt}`)
        break
      }
      
      if (status.status === 'failed') {
        console.log('\n❌ TRANSCRIPTION FAILED!')
        console.log(`💥 Error: ${status.error}`)
        break
      }
      
      // Wait before next check
      console.log('⏳ Waiting 30 seconds...')
      await new Promise(resolve => setTimeout(resolve, 30000))
    }

    if (attempts >= maxAttempts) {
      console.log('\n⏰ Maximum attempts reached')
      console.log('🔍 Check Supabase logs: https://supabase.com/dashboard/project/dkzhlqatscxpcdctvbmo/functions')
    }

  } catch (error) {
    console.error('\n💥 Test failed:', error.message)
    process.exit(1)
  }
}

// Run the test
testSupabaseQueue().catch(console.error) 