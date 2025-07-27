#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { default: fetch } = require('node-fetch');
const FormData = require('form-data');

async function testSimpleAPI() {
  console.log('🧪 בדיקת API הפשוט עם קטע קטן...\n');

  try {
    // יצירת קטע קטן (30 שניות)
    const audioFilePath = path.join(__dirname, 'test_input', 'audio1436646319.m4a');
    const testSegmentPath = path.join(__dirname, 'temp_test_30sec_simple.mp3');
    
    console.log('1. יוצר קטע של 30 שניות...');
    const { execSync } = require('child_process');
    execSync(`ffmpeg -i "${audioFilePath}" -t 30 -acodec mp3 -ar 16000 -ac 1 -y "${testSegmentPath}"`, { 
      stdio: 'pipe' 
    });
    
    const segmentStats = fs.statSync(testSegmentPath);
    console.log('   ✅ נוצר קטע:', (segmentStats.size / 1024).toFixed(2), 'KB');
    
    // שליחה ל-API הפשוט
    console.log('\n2. שולח ל-API הפשוט...');
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream(testSegmentPath));
    
    console.log('   📤 מעלה ומתמלל...');
    
    const response = await fetch('http://localhost:3000/api/transcribe-simple', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('   ✅ תמלול הצליח!');
      console.log('   📝 תוצאה:');
      console.log('   ─'.repeat(60));
      console.log('   ' + (result.transcription || 'אין טקסט תמלול'));
      console.log('   ─'.repeat(60));
      
      if (result.language) {
        console.log('   🌍 שפה מזוהה:', result.language);
      }
      
      console.log('\n🎉 הבדיקה הצליחה! האפליקציה עובדת!');
      console.log('💡 עכשיו אפשר לגשת ל: http://localhost:3000/test-simple');
      
    } else {
      console.error('   ❌ תמלול נכשל:', result.error);
      console.error('   📄 פרטים:', result.details);
    }
    
    // ניקוי
    if (fs.existsSync(testSegmentPath)) {
      fs.unlinkSync(testSegmentPath);
      console.log('   🧹 קובץ זמני נמחק');
    }

  } catch (error) {
    console.error('❌ שגיאה:', error.message);
  }
}

testSimpleAPI();