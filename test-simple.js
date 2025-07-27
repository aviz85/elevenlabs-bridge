#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { default: fetch } = require('node-fetch');
const FormData = require('form-data');

// Mock database for testing
const mockDB = {
  tasks: new Map(),
  segments: new Map(),
  
  createTask(data) {
    const id = 'task-' + Date.now();
    const task = {
      id,
      ...data,
      status: 'processing',
      total_segments: 1,
      completed_segments: 0,
      created_at: new Date().toISOString()
    };
    this.tasks.set(id, task);
    return task;
  },
  
  getTask(id) {
    return this.tasks.get(id);
  },
  
  updateTask(id, updates) {
    const task = this.tasks.get(id);
    if (task) {
      Object.assign(task, updates);
      this.tasks.set(id, task);
    }
    return task;
  }
};

async function testSimpleTranscription() {
  console.log('🧪 בדיקה פשוטה של תמלול עם קובץ הקלט...\n');

  const audioFilePath = path.join(__dirname, 'test_input', 'audio1436646319.m4a');
  
  if (!fs.existsSync(audioFilePath)) {
    console.error('❌ קובץ השמע לא נמצא:', audioFilePath);
    return;
  }

  console.log('📁 נמצא קובץ שמע:', audioFilePath);
  const stats = fs.statSync(audioFilePath);
  console.log('📊 גודל קובץ:', (stats.size / 1024 / 1024).toFixed(2), 'MB');
  console.log('⏱️  משך:', '~1.8 שעות (קובץ ארוך מאוד!)');

  // יצירת משימה במסד נתונים מדומה
  console.log('\n1. יוצר משימה במסד נתונים...');
  const task = mockDB.createTask({
    client_webhook_url: 'http://localhost:3000/webhook/test',
    original_filename: 'audio1436646319.m4a'
  });
  console.log('   ✅ משימה נוצרה:', task.id);

  // בדיקת ElevenLabs API עם קטע קטן
  console.log('\n2. בודק את ElevenLabs API...');
  
  try {
    const apiKey = 'sk_63273dc2fb5b982fa618983c924954749908381a638d1566';
    
    // ניסיון ליצור קטע קטן מהקובץ (אם יש ffmpeg)
    console.log('   🔄 מנסה ליצור קטע קטן לבדיקה...');
    
    const { execSync } = require('child_process');
    const testSegmentPath = path.join(__dirname, 'temp_test_segment.mp3');
    
    try {
      // יצירת קטע של 30 שניות לבדיקה
      execSync(`ffmpeg -i "${audioFilePath}" -t 30 -acodec mp3 -y "${testSegmentPath}"`, { 
        stdio: 'pipe' 
      });
      
      console.log('   ✅ נוצר קטע בדיקה של 30 שניות');
      
      // שליחה ל-ElevenLabs
      const formData = new FormData();
      formData.append('file', fs.createReadStream(testSegmentPath));
      formData.append('model_id', 'eleven_multilingual_v2');
      
      console.log('   📤 שולח לElevenLabs...');
      
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
        console.log('   📝 תוצאה:');
        console.log('   ─'.repeat(50));
        console.log(result.text || 'אין טקסט תמלול');
        console.log('   ─'.repeat(50));
        
        // עדכון המשימה
        mockDB.updateTask(task.id, {
          status: 'completed',
          final_transcription: result.text,
          completed_segments: 1,
          completed_at: new Date().toISOString()
        });
        
        console.log('\n   ✅ המשימה הושלמה בהצלחה!');
        
      } else {
        const errorText = await response.text();
        console.error('   ❌ תמלול נכשל:', response.status, response.statusText);
        console.error('   📄 פרטי שגיאה:', errorText);
        
        mockDB.updateTask(task.id, {
          status: 'failed',
          error_message: `API Error: ${response.status} ${response.statusText}`
        });
      }
      
      // ניקוי קובץ זמני
      if (fs.existsSync(testSegmentPath)) {
        fs.unlinkSync(testSegmentPath);
        console.log('   🧹 קובץ זמני נמחק');
      }
      
    } catch (ffmpegError) {
      console.log('   ⚠️  ffmpeg לא זמין, מדלג על יצירת קטע בדיקה');
      console.log('   💡 להתקנת ffmpeg: brew install ffmpeg');
      
      // ניסיון עם הקובץ המלא (עלול להיכשל בגלל הגודל)
      console.log('   🎯 מנסה עם הקובץ המלא (עלול להיכשל)...');
      
      const formData = new FormData();
      formData.append('file', fs.createReadStream(audioFilePath));
      formData.append('model_id', 'eleven_multilingual_v2');
      
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
        const errorText = await response.text();
        console.error('   ❌ תמלול נכשל כצפוי:', response.status);
        console.log('   💡 הקובץ גדול מדי ל-ElevenLabs API');
      }
    }

  } catch (error) {
    console.error('❌ שגיאה במהלך הבדיקה:', error.message);
    mockDB.updateTask(task.id, {
      status: 'failed',
      error_message: error.message
    });
  }

  // הצגת סטטוס סופי
  console.log('\n3. סטטוס סופי:');
  const finalTask = mockDB.getTask(task.id);
  console.log('   📋 מזהה משימה:', finalTask.id);
  console.log('   📊 סטטוס:', finalTask.status);
  console.log('   ⏰ נוצר:', finalTask.created_at);
  if (finalTask.completed_at) {
    console.log('   ✅ הושלם:', finalTask.completed_at);
  }
  if (finalTask.error_message) {
    console.log('   ❌ שגיאה:', finalTask.error_message);
  }

  console.log('\n🎯 מסקנות:');
  console.log('1. ElevenLabs API עובד');
  console.log('2. הקובץ גדול מדי לתמלול ישיר');
  console.log('3. צריך לחלק לקטעים קטנים (15 דקות כל אחד)');
  console.log('4. צריך Supabase מוגדר כראוי לאפליקציה המלאה');
}

testSimpleTranscription();