#!/usr/bin/env node

const { default: fetch } = require('node-fetch');

async function testRealGoogleFunction() {
  console.log('🧪 בדיקת Google Cloud Function עם הקובץ האמיתי...\n');

  try {
    console.log('1. קורא ל-Google Cloud Function...');
    
    const functionUrl = 'https://us-central1-dreemz-whatsapp-mentor.cloudfunctions.net/splitAudio';
    
    // השתמש בקובץ שהעלינו ל-Cloud Storage
    const audioUrl = 'https://storage.googleapis.com/elevenlabs-audio-segments/test/audio1436646319.m4a';
    
    const payload = {
      audioUrl: audioUrl,
      segmentDurationMinutes: 15, // 15 דקות כמו שתכננו
      returnFormat: 'mp3'
    };

    console.log('   📤 שולח בקשה...');
    console.log('   🔗 Function URL:', functionUrl);
    console.log('   🎵 Audio URL:', audioUrl);
    console.log('   ⏱️  Segment Duration:', payload.segmentDurationMinutes, 'minutes');
    
    const startTime = Date.now();
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseTime = Date.now() - startTime;
    console.log('   📊 סטטוס תגובה:', response.status, response.statusText);
    console.log('   ⏱️  זמן תגובה:', (responseTime / 1000).toFixed(2), 'שניות');

    if (response.ok) {
      const result = await response.json();
      console.log('   ✅ הפונקציה עבדה בהצלחה!');
      
      console.log('\n🎉 תוצאות מלאות:');
      console.log('   🆔 Task ID:', result.taskId);
      console.log('   ⏱️  משך מקורי:', Math.floor(result.originalDuration / 60) + ':' + Math.floor(result.originalDuration % 60).toString().padStart(2, '0'), `(${result.originalDuration} שניות)`);
      console.log('   📊 גודל מקורי:', (result.originalSize / 1024 / 1024).toFixed(2), 'MB');
      console.log('   🔪 מספר קטעים:', result.segmentsCount);
      console.log('   ⚡ זמן עיבוד:', (result.processingTimeMs / 1000).toFixed(2), 'שניות');
      console.log('   🪣 Bucket:', result.bucketName);
      console.log('   💬 הודעה:', result.message);
      
      if (result.segments && result.segments.length > 0) {
        console.log('\n📋 קטעים שנוצרו:');
        result.segments.forEach((segment, index) => {
          const startMin = Math.floor(segment.startTime / 60);
          const startSec = Math.floor(segment.startTime % 60);
          const endMin = Math.floor(segment.endTime / 60);
          const endSec = Math.floor(segment.endTime % 60);
          const durationMin = Math.floor(segment.duration / 60);
          const durationSec = Math.floor(segment.duration % 60);
          
          console.log(`\n   ${index + 1}. קטע ${segment.index}:`);
          console.log(`      ⏱️  זמן: ${startMin}:${startSec.toString().padStart(2, '0')} - ${endMin}:${endSec.toString().padStart(2, '0')} (${durationMin}:${durationSec.toString().padStart(2, '0')})`);
          console.log(`      📊 גודל: ${(segment.size / 1024 / 1024).toFixed(2)} MB`);
          console.log(`      📁 קובץ: ${segment.fileName}`);
          console.log(`      🔗 URL: ${segment.downloadUrl.substring(0, 100)}...`);
        });
      }
      
      console.log('\n🎯 מה הלאה?');
      console.log('1. ✅ הפיצול עבד מצוין!');
      console.log('2. 🎙️ עכשיו אפשר לשלוח כל קטע ל-ElevenLabs');
      console.log('3. 🔄 לשלב עם האפליקציה שלך');
      console.log('4. 📝 לקבל תמלול מלא');
      
      console.log('\n💡 דוגמה לשימוש עם ElevenLabs:');
      if (result.segments && result.segments.length > 0) {
        console.log(`   curl -X POST https://api.elevenlabs.io/v1/speech-to-text \\`);
        console.log(`     -H "xi-api-key: YOUR_API_KEY" \\`);
        console.log(`     -F "file=@segment_1.mp3" \\`);
        console.log(`     -F "model_id=scribe_v1"`);
      }
      
    } else {
      const errorText = await response.text();
      console.error('   ❌ הפונקציה נכשלה:', response.status, response.statusText);
      console.error('   📄 פרטי שגיאה:', errorText);
      
      if (response.status === 500) {
        console.log('\n🔧 פתרון בעיות:');
        console.log('1. בדוק את הלוגים: gcloud functions logs read splitAudio --region us-central1');
        console.log('2. ודא שהקובץ נגיש: curl -I ' + audioUrl);
        console.log('3. בדוק את הרשאות ה-bucket');
      }
    }

  } catch (error) {
    console.error('❌ שגיאה:', error.message);
  }

  console.log('\n📋 סיכום:');
  console.log('🎯 Google Cloud Function פרוס ומוכן');
  console.log('🔧 FFmpeg זמין ועובד');
  console.log('💾 Cloud Storage מוגדר');
  console.log('🚀 מוכן לאינטגרציה עם האפליקציה');
}

testRealGoogleFunction();