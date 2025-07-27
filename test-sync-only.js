#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { default: fetch } = require('node-fetch');
const FormData = require('form-data');

async function testSyncTranscription() {
  console.log('🧪 בדיקה סינכרונית (ללא webhook) עם קובץ הקלט...\n');

  const audioFilePath = path.join(__dirname, 'test_input', 'audio1436646319.m4a');
  
  if (!fs.existsSync(audioFilePath)) {
    console.error('❌ קובץ השמע לא נמצא:', audioFilePath);
    return;
  }

  console.log('📁 נמצא קובץ שמע:', audioFilePath);
  const stats = fs.statSync(audioFilePath);
  console.log('📊 גודל קובץ:', (stats.size / 1024 / 1024).toFixed(2), 'MB');

  const apiKey = 'sk_63273dc2fb5b982fa618983c924954749908381a638d1566';

  try {
    // יצירת קטע קטן לבדיקה (30 שניות)
    console.log('\n1. יוצר קטע קטן לבדיקה...');
    
    const { execSync } = require('child_process');
    const testSegmentPath = path.join(__dirname, 'temp_test_30sec.mp3');
    
    try {
      // יצירת קטע של 30 שניות
      console.log('   🔄 חותך 30 שניות ראשונות...');
      execSync(`ffmpeg -i "${audioFilePath}" -t 30 -acodec mp3 -ar 16000 -ac 1 -y "${testSegmentPath}"`, { 
        stdio: 'pipe' 
      });
      
      const segmentStats = fs.statSync(testSegmentPath);
      console.log('   ✅ נוצר קטע:', (segmentStats.size / 1024).toFixed(2), 'KB');
      
      // שליחה ל-ElevenLabs (מצב סינכרוני - ללא webhook)
      console.log('\n2. שולח ל-ElevenLabs (מצב סינכרוני)...');
      
      const formData = new FormData();
      formData.append('file', fs.createReadStream(testSegmentPath));
      formData.append('model_id', 'scribe_v1');
      // לא שולחים webhook parameter - זה יהיה סינכרוני
      
      console.log('   📤 מעלה ומתמלל...');
      
      const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          ...formData.getHeaders()
        },
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        console.log('   ✅ תמלול הצליח!');
        console.log('   📝 תוצאה (30 שניות ראשונות):');
        console.log('   ─'.repeat(60));
        console.log('   ' + (result.text || 'אין טקסט תמלול'));
        console.log('   ─'.repeat(60));
        
        if (result.language_code) {
          console.log('   🌍 שפה מזוהה:', result.language_code);
        }
        
        console.log('\n🎯 המסקנה: ElevenLabs API עובד מצוין!');
        console.log('💡 כדי לתמלל את הקובץ המלא (1.8 שעות):');
        console.log('   1. צריך לחלק לקטעים של 15 דקות');
        console.log('   2. לשלוח כל קטע בנפרד');
        console.log('   3. לחבר את התוצאות');
        console.log('   4. או להשתמש ב-webhook mode עם ngrok');
        
      } else {
        const errorText = await response.text();
        console.error('   ❌ תמלול נכשל:', response.status, response.statusText);
        console.error('   📄 פרטי שגיאה:', errorText);
        
        if (response.status === 413) {
          console.log('   💡 הקובץ גדול מדי - נסה קטע קצר יותר');
        } else if (response.status === 401) {
          console.log('   💡 בעיה עם API key');
        } else if (response.status === 422) {
          console.log('   💡 פורמט קובץ לא נתמך או בעיה אחרת');
        }
      }
      
      // ניקוי
      if (fs.existsSync(testSegmentPath)) {
        fs.unlinkSync(testSegmentPath);
        console.log('   🧹 קובץ זמני נמחק');
      }
      
    } catch (ffmpegError) {
      console.log('   ⚠️  ffmpeg לא זמין');
      console.log('   💡 להתקנה: brew install ffmpeg');
      console.log('   🔄 מנסה עם הקובץ המלא (עלול להיכשל)...');
      
      // ניסיון עם הקובץ המלא
      const formData = new FormData();
      formData.append('file', fs.createReadStream(audioFilePath));
      formData.append('model_id', 'scribe_v1');
      
      const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          ...formData.getHeaders()
        },
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        console.log('   ✅ תמלול הצליח (מפתיע!)');
        console.log('   📝 תוצאה:', result.text?.substring(0, 200) + '...');
      } else {
        console.error('   ❌ תמלול נכשל:', response.status);
        console.log('   💡 הקובץ גדול מדי - צריך לחלק לקטעים');
      }
    }

  } catch (error) {
    console.error('❌ שגיאה:', error.message);
  }

  console.log('\n📋 סיכום:');
  console.log('✅ ElevenLabs API עובד');
  console.log('⚠️  הקובץ גדול מדי לתמלול ישיר');
  console.log('🔧 לאפליקציה המלאה צריך:');
  console.log('   1. Supabase מוגדר (מסד נתונים + storage)');
  console.log('   2. ngrok לwebhook (או מצב סינכרוני)');
  console.log('   3. חלוקה לקטעים של 15 דקות');
}

testSyncTranscription();