#!/usr/bin/env node

const https = require('https');

// בדיקת אינטגרציה עם Google Cloud Functions
async function checkGoogleIntegration() {
  console.log('☁️ בודק אינטגרציה עם Google Cloud Functions...');
  console.log('='.repeat(60));

  const GOOGLE_FUNCTION_URL = 'https://us-central1-dreemz-whatsapp-mentor.cloudfunctions.net/splitAudio';
  const AUDIO_URL = 'https://storage.googleapis.com/elevenlabs-audio-segments/test/audio1436646319.m4a';

  // 1. בדיקת health של Google Cloud Function
  console.log('\n1️⃣ בודק שGoogle Cloud Function פעיל...');
  
  try {
    const healthUrl = 'https://us-central1-dreemz-whatsapp-mentor.cloudfunctions.net/health';
    const healthResponse = await makeRequest(healthUrl, { method: 'GET' });
    
    if (healthResponse.statusCode === 200) {
      console.log('✅ Google Cloud Function פעיל');
      console.log('📊 מידע על הפונקציה:', JSON.stringify(healthResponse.data, null, 2));
    } else {
      console.log(`❌ Google Cloud Function לא פעיל: ${healthResponse.statusCode}`);
      console.log('📄 תגובה:', healthResponse.data);
    }
  } catch (error) {
    console.log('❌ שגיאה בגישה לGoogle Cloud Function:', error.message);
  }

  // 2. בדיקת קיום הקובץ באודיו ב-Google Cloud Storage
  console.log('\n2️⃣ בודק קיום הקובץ ב-Google Cloud Storage...');
  
  try {
    const audioResponse = await makeRequest(AUDIO_URL, { method: 'HEAD' });
    
    if (audioResponse.statusCode === 200) {
      console.log('✅ קובץ האודיו קיים ב-Google Cloud Storage');
      console.log(`📁 URL: ${AUDIO_URL}`);
    } else {
      console.log(`❌ קובץ האודיו לא נמצא: ${audioResponse.statusCode}`);
    }
  } catch (error) {
    console.log('❌ שגיאה בבדיקת קובץ האודיו:', error.message);
  }

  // 3. בדיקת פיצול אודיו ישירות עם Google Cloud Function
  console.log('\n3️⃣ בודק פיצול אודיו ישירות...');
  
  try {
    const splitRequest = {
      audioUrl: AUDIO_URL,
      segmentDurationMinutes: 15,
      returnFormat: 'mp3'
    };

    console.log('📤 שולח בקשת פיצול...');
    console.log('📋 פרמטרים:', JSON.stringify(splitRequest, null, 2));

    const splitResponse = await makeRequest(GOOGLE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(splitRequest)
    });

    if (splitResponse.statusCode === 200 && splitResponse.data.success) {
      console.log('🎉 פיצול האודיו הצליח!');
      console.log(`✅ Task ID: ${splitResponse.data.taskId}`);
      console.log(`✅ משך מקורי: ${Math.floor(splitResponse.data.originalDuration / 60)}:${Math.floor(splitResponse.data.originalDuration % 60).toString().padStart(2, '0')}`);
      console.log(`✅ חתיכות שנוצרו: ${splitResponse.data.segmentsCount}`);
      console.log(`✅ זמן עיבוד: ${(splitResponse.data.processingTimeMs / 1000).toFixed(2)} שניות`);
      
      if (splitResponse.data.segments && splitResponse.data.segments.length > 0) {
        console.log('\n📋 חתיכות שנוצרו:');
        splitResponse.data.segments.slice(0, 3).forEach((segment, index) => {
          const startMin = Math.floor(segment.startTime / 60);
          const startSec = Math.floor(segment.startTime % 60);
          const endMin = Math.floor(segment.endTime / 60);
          const endSec = Math.floor(segment.endTime % 60);
          
          console.log(`   ${index + 1}. [${startMin}:${startSec.toString().padStart(2, '0')}-${endMin}:${endSec.toString().padStart(2, '0')}] ${(segment.size / 1024 / 1024).toFixed(2)} MB`);
          console.log(`      📁 ${segment.fileName}`);
          console.log(`      🔗 ${segment.downloadUrl.substring(0, 70)}...`);
        });
        
        if (splitResponse.data.segments.length > 3) {
          console.log(`   ... ועוד ${splitResponse.data.segments.length - 3} חתיכות`);
        }
      }
      
      console.log('\n🔗 בדיקת נגישות החתיכות ב-Google Cloud Storage:');
      const firstSegment = splitResponse.data.segments[0];
      if (firstSegment) {
        try {
          const segmentCheck = await makeRequest(firstSegment.downloadUrl, { method: 'HEAD' });
          if (segmentCheck.statusCode === 200) {
            console.log('✅ החתיכה הראשונה נגישה ב-Google Cloud Storage');
          } else {
            console.log(`❌ החתיכה הראשונה לא נגישה: ${segmentCheck.statusCode}`);
          }
        } catch (error) {
          console.log('❌ שגיאה בבדיקת החתיכה:', error.message);
        }
      }
      
    } else {
      console.log('❌ פיצול האודיו נכשל');
      console.log('📄 מידע על השגיאה:', JSON.stringify(splitResponse.data, null, 2));
    }
  } catch (error) {
    console.log('❌ שגיאה בפיצול האודיו:', error.message);
  }

  // 4. סיכום ומסקנות
  console.log('\n' + '='.repeat(60));
  console.log('📋 סיכום בדיקת Google Cloud Functions');
  console.log('='.repeat(60));
  console.log('✅ אם כל הבדיקות הצליחו - האינטגרציה עם Google עובדת');
  console.log('✅ הקובץ שלך מפוצל נכון לחתיכות');
  console.log('✅ החתיכות נשמרות ב-Google Cloud Storage');
  console.log('');
  console.log('💡 אם יש בעיות כאן, הבעיה היא ב:');
  console.log('- חיבור לGoogle Cloud Functions');
  console.log('- הגדרות Google Cloud Storage');
  console.log('- קובץ האודיו המקורי');
  console.log('');
  console.log('💡 אם הכל עובד כאן אבל לא בשרת שלך, הבעיה היא ב:');
  console.log('- הגדרת USE_GOOGLE_CLOUD_FUNCTIONS');
  console.log('- משתני הסביבה בVercel');
  console.log('- האופן שבו השרת קורא לGoogle Cloud Functions');
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

checkGoogleIntegration().catch(console.error); 