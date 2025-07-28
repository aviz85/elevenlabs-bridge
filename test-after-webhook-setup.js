#!/usr/bin/env node

console.log('🎯 בדיקת פייפליין לאחר הגדרת ElevenLabs Webhook')
console.log('=' .repeat(60))

const https = require('https')
const { performance } = require('perf_hooks')

const SERVER_URL = 'https://elevenlabs-bridge-henna.vercel.app'
const AUDIO_FILE = 'audio1436646319.m4a'
const AUDIO_SIZE = 69649037

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          resolve({ status: res.statusCode, data: parsed })
        } catch (e) {
          resolve({ status: res.statusCode, data })
        }
      })
    })
    
    req.on('error', reject)
    
    if (options.body) {
      req.write(JSON.stringify(options.body))
    }
    
    req.end()
  })
}

async function createTask() {
  console.log('\n📝 שלב 1: יוצר משימת תמלול...')
  
  try {
    const response = await makeRequest(`${SERVER_URL}/api/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        webhookUrl: `${SERVER_URL}/api/webhook/elevenlabs`,
        filename: AUDIO_FILE,
        fileSize: AUDIO_SIZE
      }
    })

    if (response.status === 200 && response.data.taskId) {
      console.log(`✅ משימה נוצרה: ${response.data.taskId}`)
      return response.data.taskId
    } else {
      console.log(`❌ שגיאה ביצירת משימה: ${response.status}`)
      console.log(response.data)
      return null
    }
  } catch (error) {
    console.error('❌ שגיאה בבקשה:', error.message)
    return null
  }
}

async function processQueue(attempt = 1) {
  console.log(`\n⚙️ שלב ${attempt + 1}: מפעיל queue processing...`)
  
  try {
    const response = await makeRequest(`${SERVER_URL}/api/process-queue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: {
        maxJobs: 8
      }
    })

    if (response.status === 200) {
      const { processedJobs, remainingJobs } = response.data
      console.log(`✅ Queue: עיבד ${processedJobs} jobs, נשארו ${remainingJobs}`)
      return { processedJobs, remainingJobs }
    } else {
      console.log(`❌ שגיאה בqueue processing: ${response.status}`)
      return { processedJobs: 0, remainingJobs: 0 }
    }
  } catch (error) {
    console.error('❌ שגיאה בqueue processing:', error.message)
    return { processedJobs: 0, remainingJobs: 0 }
  }
}

async function checkTaskStatus(taskId, attempt = 1) {
  console.log(`\n📊 בודק סטטוס משימה (בדיקה ${attempt})...`)
  
  try {
    const response = await makeRequest(`${SERVER_URL}/api/status/${taskId}`)

    if (response.status === 200) {
      const { status, progress, segments } = response.data
      
      const segmentStats = {
        pending: segments.filter(s => s.status === 'pending').length,
        processing: segments.filter(s => s.status === 'processing').length,
        completed: segments.filter(s => s.status === 'completed').length,
        failed: segments.filter(s => s.status === 'failed').length
      }

      console.log(`📋 סטטוס משימה: ${status}`)
      console.log(`📈 התקדמות: ${progress.completedSegments}/${progress.totalSegments} (${progress.percentage}%)`)
      console.log(`📊 סטטוס segments:`)
      console.log(`   ⏳ Pending: ${segmentStats.pending}`)
      console.log(`   🔄 Processing: ${segmentStats.processing}`)
      console.log(`   ✅ Completed: ${segmentStats.completed}`)
      console.log(`   ❌ Failed: ${segmentStats.failed}`)

      // Show completed segments with transcription
      const completedWithText = segments
        .filter(s => s.status === 'completed' && s.transcriptionText)
        .map(s => ({
          time: `${Math.floor(s.startTime/60)}:${(s.startTime%60).toString().padStart(2,'0')}`,
          length: s.transcriptionText.length,
          preview: s.transcriptionText.substring(0, 50) + '...'
        }))

      if (completedWithText.length > 0) {
        console.log(`\n🎉 חתיכות עם תמלול:`)
        completedWithText.forEach(segment => {
          console.log(`   ${segment.time}: ${segment.length} תווים - "${segment.preview}"`)
        })
      }

      // Show errors for failed segments
      const failedSegments = segments
        .filter(s => s.status === 'failed' && s.error)
        .map(s => ({
          time: `${Math.floor(s.startTime/60)}:${(s.startTime%60).toString().padStart(2,'0')}`,
          error: s.error
        }))

      if (failedSegments.length > 0) {
        console.log(`\n❌ שגיאות:`)
        failedSegments.forEach(segment => {
          console.log(`   ${segment.time}: ${segment.error}`)
        })
      }

      return {
        isComplete: progress.completedSegments === progress.totalSegments,
        hasResults: completedWithText.length > 0,
        progress: progress.percentage,
        segmentStats
      }
    } else {
      console.log(`❌ שגיאה בבדיקת סטטוס: ${response.status}`)
      return null
    }
  } catch (error) {
    console.error('❌ שגיאה בבדיקת סטטוס:', error.message)
    return null
  }
}

async function main() {
  const startTime = performance.now()
  
  console.log('🔍 בדיקה זו מניחה שכבר הגדרת webhook ב-ElevenLabs dashboard:')
  console.log(`   📡 ${SERVER_URL}/api/webhook/elevenlabs`)
  console.log('   📋 Speech-to-Text Completed events')
  console.log('')

  // Step 1: Create task
  const taskId = await createTask()
  if (!taskId) {
    console.log('❌ לא ניתן ליצור משימה - מסיים')
    return
  }

  // Step 2: Wait for Google Cloud Functions
  console.log('\n⏳ מחכה 45 שניות לGoogle Cloud Functions לפצל את השמע...')
  await new Promise(resolve => setTimeout(resolve, 45000))

  // Step 3: Process queue in batches
  let attempt = 1
  let totalProcessed = 0
  
  while (attempt <= 3) {
    const result = await processQueue(attempt)
    totalProcessed += result.processedJobs
    
    if (result.processedJobs === 0) {
      console.log('   📝 אין עוד jobs לעיבוד')
      break
    }
    
    attempt++
    if (attempt <= 3) {
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
  }

  if (totalProcessed === 0) {
    console.log('❌ לא עובדו jobs בqueue - יכול להיות שGoogle Cloud Functions עדיין רץ')
    console.log('💡 נסה להריץ שוב אחרי דקה')
    return
  }

  console.log(`\n📊 סה"כ עובדו ${totalProcessed} segments`)
  console.log('⏳ מחכה 2 דקות לElevenLabs לעבד...')
  await new Promise(resolve => setTimeout(resolve, 120000))

  // Step 4: Check results multiple times
  let checkAttempt = 1
  let lastResult = null
  
  while (checkAttempt <= 5) {
    lastResult = await checkTaskStatus(taskId, checkAttempt)
    
    if (!lastResult) break
    
    if (lastResult.hasResults) {
      console.log('\n🎉 יש תוצאות תמלול!')
      break
    }
    
    if (checkAttempt < 5) {
      console.log('   ⏳ מחכה עוד דקה...')
      await new Promise(resolve => setTimeout(resolve, 60000))
    }
    
    checkAttempt++
  }

  // Final summary
  const duration = Math.round((performance.now() - startTime) / 1000)
  console.log('\n' + '='.repeat(60))
  console.log('📋 סיכום:')
  console.log(`⏱️  זמן כולל: ${Math.floor(duration/60)}:${(duration%60).toString().padStart(2,'0')}`)
  console.log(`📋 Task ID: ${taskId}`)
  
  if (lastResult) {
    console.log(`📈 התקדמות: ${lastResult.progress}%`)
    console.log(`✅ תוצאות: ${lastResult.hasResults ? 'יש תמלול!' : 'אין תמלול עדיין'}`)
    
    if (!lastResult.hasResults) {
      console.log('\n💡 אם אין תמלול:')
      console.log('   1. ודא שwebhook מוגדר ב-ElevenLabs dashboard')
      console.log('   2. בדוק logs של /api/webhook/elevenlabs ב-Vercel')
      console.log('   3. ודא שELEVENLABS_API_KEY מוגדר נכון')
      console.log('   4. נסה להריץ שוב את הסקריפט')
    }
  }
  
  console.log(`\n🔍 בדיקת סטטוס נוספת: curl "${SERVER_URL}/api/status/${taskId}"`)
}

main().catch(console.error) 