#!/usr/bin/env node

const { default: fetch } = require('node-fetch');

async function testAudioCapabilities() {
  console.log('🧪 בדיקת יכולות עיבוד אודיו של Edge Function...\n');

  const supabaseUrl = 'https://dkzhlqatscxpcdctvbmo.supabase.co';
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRremhscWF0c2N4cGNkY3R2Ym1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0Mjg1NjUsImV4cCI6MjA2OTAwNDU2NX0.emHI0-bBZ1-jXFtWvGXYmwrKGf4aFFIZQhL0FlZL8CI';

  try {
    console.log('📋 בודק יכולות עיבוד אודיו...');
    
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/audio-processor`;
    
    const payload = {
      taskId: 'test-capabilities-' + Date.now(),
      originalFilename: 'test-audio.wav',
      testMode: true
    };

    console.log('   📤 שולח בקשת בדיקה...');
    
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    console.log('   📊 סטטוס תגובה:', response.status, response.statusText);

    if (response.ok) {
      const result = await response.json();
      console.log('   ✅ בדיקה הושלמה בהצלחה!\n');
      
      console.log('🔧 יכולות מערכת:');
      console.log('   🖥️  פלטפורמה:', result.capabilities.environment.platform);
      console.log('   🏗️  ארכיטקטורה:', result.capabilities.environment.arch);
      console.log('   🦕 Deno גרסה:', result.capabilities.environment.denoVersion);
      
      console.log('\n🎬 יכולות FFmpeg:');
      if (result.capabilities.ffmpeg.available) {
        console.log('   ✅ FFmpeg זמין - גרסה:', result.capabilities.ffmpeg.version);
      } else {
        console.log('   ❌ FFmpeg לא זמין');
      }
      
      if (result.capabilities.ffprobe.available) {
        console.log('   ✅ FFprobe זמין - גרסה:', result.capabilities.ffprobe.version);
      } else {
        console.log('   ❌ FFprobe לא זמין');
      }
      
      console.log('\n🎵 יכולות עיבוד אודיו:');
      if (result.capabilities.audioProcessing.canGenerate) {
        console.log('   ✅ יכול ליצור קבצי אודיו');
      } else {
        console.log('   ❌ לא יכול ליצור קבצי אודיו');
      }
      
      if (result.capabilities.audioProcessing.canSplit) {
        console.log('   ✅ יכול לפצל קבצי אודיו');
        if (result.capabilities.audioProcessing.testDuration > 0) {
          console.log('   📏 בדיקת משך:', result.capabilities.audioProcessing.testDuration, 'שניות');
        }
      } else {
        console.log('   ❌ לא יכול לפצל קבצי אודיו');
      }
      
      console.log('\n📁 יכולות מערכת קבצים:');
      if (result.capabilities.fileSystem.canReadWrite) {
        console.log('   ✅ יכול לקרוא ולכתוב קבצים');
      } else {
        console.log('   ❌ לא יכול לקרוא ולכתוב קבצים');
      }
      
      console.log('\n🎯 סיכום:');
      if (result.ready) {
        console.log('   ✅ המערכת מוכנה לעיבוד אודיו מלא!');
        console.log('   🔧 יכולות זמינות:');
        console.log('      - המרת פורמטים');
        console.log('      - זיהוי משך אודיו');
        console.log('      - פיצול לקטעים');
        console.log('      - עיבוד קבצים זמניים');
        
        console.log('\n💡 זה אומר שאפשר:');
        console.log('   1. להעלות את הקובץ שלך (66MB) ל-Supabase Storage');
        console.log('   2. ה-Edge Function יוריד אותו');
        console.log('   3. יפצל אותו לקטעים של 15 דקות');
        console.log('   4. יעלה כל קטע בחזרה ל-Storage');
        console.log('   5. ישלח כל קטע ל-ElevenLabs לתמלול');
        console.log('   6. יחבר את התוצאות');
        
      } else {
        console.log('   ❌ המערכת לא מוכנה לעיבוד אודיו מלא');
        console.log('   🔧 חסרות יכולות חיוניות');
      }
      
    } else {
      const errorText = await response.text();
      console.error('   ❌ בדיקה נכשלה:', response.status, response.statusText);
      console.error('   📄 פרטי שגיאה:', errorText);
    }

  } catch (error) {
    console.error('❌ שגיאה בבדיקת יכולות:', error.message);
  }

  console.log('\n📋 מסקנה:');
  console.log('🎯 אם FFmpeg זמין - המערכת המלאה יכולה לעבוד');
  console.log('🔧 אם לא - נצטרך פתרון חלופי לפיצול אודיו');
}

testAudioCapabilities();