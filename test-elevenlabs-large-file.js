#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { default: fetch } = require('node-fetch');
const FormData = require('form-data');

async function testElevenLabsLargeFile() {
  console.log('🧪 בדיקת ElevenLabs עם קובץ גדול...\n');

  const audioFilePath = path.join(__dirname, 'test_input', 'audio1436646319.m4a');
  
  if (!fs.existsSync(audioFilePath)) {
    console.error('❌ קובץ השמע לא נמצא:', audioFilePath);
    return;
  }

  const stats = fs.statSync(audioFilePath);
  console.log('📁 קובץ מקורי:', audioFilePath);
  console.log('📊 גודל:', (stats.size / 1024 / 1024).toFixed(2), 'MB');

  const apiKey = 'sk_63273dc2fb5b982fa618983c924954749908381a638d1566';

  try {
    console.log('\n1. בודק מגבלות ElevenLabs...');
    
    // בדיקת מידע משתמש
    const userResponse = await fetch('https://api.elevenlabs.io/v1/user', {
      headers: { 'xi-api-key': apiKey }
    });

    if (userResponse.ok) {
      const userData = await userResponse.json();
      console.log('   📊 פרטי חשבון:');
      console.log('      - מנוי:', userData.subscription?.tier || 'לא ידוע');
      console.log('      - תווים זמינים:', userData.subscription?.character_count || 0);
      console.log('      - מגבלת תווים:', userData.subscription?.character_limit || 0);
    }

    console.log('\n2. מנסה לשלוח קובץ גדול (עלול להיכשל)...');
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioFilePath));
    formData.append('model_id', 'scribe_v1');
    
    console.log('   📤 שולח קובץ של 66MB ל-ElevenLabs...');
    console.log('   ⏰ זה עלול לקחת זמן או להיכשל...');
    
    // הגדרת timeout גדול
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 דקות
    
    try {
      const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          ...formData.getHeaders()
        },
        body: formData,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      console.log('   📊 תגובה:', response.status, response.statusText);

      if (response.ok) {
        const result = await response.json();
        console.log('   🎉 הצלחה מפתיעה! ElevenLabs קיבל את הקובץ הגדול!');
        console.log('   📝 אורך תמלול:', result.text?.length || 0, 'תווים');
        console.log('   🌍 שפה:', result.language_code || 'לא זוהה');
        
        // שמירת התוצאה לקובץ
        if (result.text) {
          fs.writeFileSync('full-transcription.txt', result.text, 'utf8');
          console.log('   💾 התמלול נשמר ל: full-transcription.txt');
        }
        
        console.log('\n🎯 מסקנה: ElevenLabs יכול לטפל בקובץ הגדול!');
        console.log('💡 זה הפתרון הכי פשוט - אין צורך בפיצול!');
        
      } else {
        const errorText = await response.text();
        console.error('   ❌ ElevenLabs דחה את הקובץ:', response.status);
        console.error('   📄 סיבה:', errorText);
        
        if (response.status === 413) {
          console.log('\n💡 הקובץ גדול מדי ל-ElevenLabs');
          console.log('🔧 פתרונות:');
          console.log('   1. פיצול ידני לקטעים קטנים יותר');
          console.log('   2. דחיסה/המרה לפורמט קטן יותר');
          console.log('   3. שימוש בשירות אחר');
        } else if (response.status === 422) {
          console.log('\n💡 בעיה בפורמט או באיכות הקובץ');
        } else if (response.status === 429) {
          console.log('\n💡 חרגת ממגבלת הקצב - נסה שוב מאוחר יותר');
        }
      }
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        console.log('   ⏰ הבקשה הופסקה בגלל timeout (5 דקות)');
        console.log('   💡 הקובץ כנראה גדול מדי לעיבוד ישיר');
      } else {
        console.error('   ❌ שגיאת רשת:', error.message);
      }
    }

  } catch (error) {
    console.error('❌ שגיאה כללית:', error.message);
  }

  console.log('\n📋 סיכום אפשרויות:');
  console.log('1. ✅ תמלול קטעים קטנים (עובד - ראינו)');
  console.log('2. ❓ תמלול קובץ מלא (נבדק עכשיו)');
  console.log('3. ❌ פיצול ב-Supabase Edge Functions (לא זמין)');
  console.log('4. ✅ פיצול ידני עם FFmpeg מקומי');
  console.log('5. ✅ שימוש בשירות חיצוני לעיבוד אודיו');
}

testElevenLabsLargeFile();