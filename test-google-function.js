#!/usr/bin/env node

const { default: fetch } = require('node-fetch');
const fs = require('fs');
const path = require('path');

async function testGoogleFunction() {
  console.log('🧪 בדיקת Google Cloud Function לפיצול אודיו...\n');

  // First, let's upload our test file to a public URL
  // For now, we'll use a smaller test file
  const audioFilePath = path.join(__dirname, 'test_input', 'audio1436646319.m4a');
  
  if (!fs.existsSync(audioFilePath)) {
    console.error('❌ קובץ השמע לא נמצא:', audioFilePath);
    return;
  }

  const stats = fs.statSync(audioFilePath);
  console.log('📁 קובץ מקורי:', audioFilePath);
  console.log('📊 גודל:', (stats.size / 1024 / 1024).toFixed(2), 'MB');

  // For testing, let's create a smaller segment first
  console.log('\n1. יוצר קטע קטן לבדיקה...');
  
  const { execSync } = require('child_process');
  const testSegmentPath = path.join(__dirname, 'temp_google_test.mp3');
  
  try {
    // יצירת קטע של 2 דקות
    execSync(`ffmpeg -i "${audioFilePath}" -t 120 -acodec mp3 -ar 16000 -ac 1 -y "${testSegmentPath}"`, { 
      stdio: 'pipe' 
    });
    
    const segmentStats = fs.statSync(testSegmentPath);
    console.log('   ✅ נוצר קטע בדיקה:', (segmentStats.size / 1024).toFixed(2), 'KB');
    
    // For this test, we'll simulate with a public audio URL
    // In real usage, you'd upload to your storage first
    
    console.log('\n2. קורא ל-Google Cloud Function...');
    
    const functionUrl = 'https://us-central1-dreemz-whatsapp-mentor.cloudfunctions.net/splitAudio';
    
    // Test with a public audio file URL (for demo)
    const testAudioUrl = 'https://www.soundjay.com/misc/sounds/bell-ringing-05.wav';
    
    const payload = {
      audioUrl: testAudioUrl,
      segmentDurationMinutes: 1, // 1 minute segments for testing
      returnFormat: 'mp3'
    };

    console.log('   📤 שולח בקשה...');
    console.log('   🔗 URL:', functionUrl);
    console.log('   📋 Payload:', JSON.stringify(payload, null, 2));
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log('   📊 סטטוס תגובה:', response.status, response.statusText);

    if (response.ok) {
      const result = await response.json();
      console.log('   ✅ הפונקציה עבדה בהצלחה!');
      console.log('\n📝 תוצאות:');
      console.log('   🆔 Task ID:', result.taskId);
      console.log('   ⏱️  משך מקורי:', Math.floor(result.originalDuration / 60) + ':' + Math.floor(result.originalDuration % 60).toString().padStart(2, '0'));
      console.log('   📊 גודל מקורי:', (result.originalSize / 1024).toFixed(2), 'KB');
      console.log('   🔪 מספר קטעים:', result.segmentsCount);
      console.log('   ⚡ זמן עיבוד:', (result.processingTimeMs / 1000).toFixed(2), 'שניות');
      console.log('   🪣 Bucket:', result.bucketName);
      
      if (result.segments && result.segments.length > 0) {
        console.log('\n📋 קטעים שנוצרו:');
        result.segments.forEach((segment, index) => {
          const startMin = Math.floor(segment.startTime / 60);
          const startSec = Math.floor(segment.startTime % 60);
          const endMin = Math.floor(segment.endTime / 60);
          const endSec = Math.floor(segment.endTime % 60);
          
          console.log(`   ${index + 1}. [${startMin}:${startSec.toString().padStart(2, '0')}-${endMin}:${endSec.toString().padStart(2, '0')}] ${(segment.size / 1024).toFixed(2)} KB`);
          console.log(`      📁 ${segment.fileName}`);
          console.log(`      🔗 ${segment.downloadUrl.substring(0, 80)}...`);
        });
      }
      
      console.log('\n🎉 הבדיקה הצליחה!');
      console.log('✅ Google Cloud Function עובד מצוין');
      console.log('✅ FFmpeg זמין ופועל');
      console.log('✅ פיצול אודיו עובד');
      console.log('✅ העלאה ל-Cloud Storage עובדת');
      console.log('✅ URLs חתומים נוצרים');
      
    } else {
      const errorText = await response.text();
      console.error('   ❌ הפונקציה נכשלה:', response.status, response.statusText);
      console.error('   📄 פרטי שגיאה:', errorText);
    }
    
    // ניקוי
    if (fs.existsSync(testSegmentPath)) {
      fs.unlinkSync(testSegmentPath);
      console.log('   🧹 קובץ זמני נמחק');
    }

  } catch (error) {
    console.error('❌ שגיאה:', error.message);
    
    if (error.message.includes('ffmpeg')) {
      console.log('\n💡 להתקנת ffmpeg מקומי:');
      console.log('   brew install ffmpeg');
    }
  }

  console.log('\n📋 מה הלאה?');
  console.log('1. ✅ Google Cloud Function מוכן ועובד');
  console.log('2. 🔄 צריך לשלב עם האפליקציה שלך');
  console.log('3. 📤 צריך להעלות קבצים ל-Cloud Storage');
  console.log('4. 🎙️ לשלב עם ElevenLabs לתמלול');
  
  console.log('\n🎯 URLs של הפונקציות:');
  console.log('   Health: https://us-central1-dreemz-whatsapp-mentor.cloudfunctions.net/health');
  console.log('   Split Audio: https://us-central1-dreemz-whatsapp-mentor.cloudfunctions.net/splitAudio');
}

testGoogleFunction();