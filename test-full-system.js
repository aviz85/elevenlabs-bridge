#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { default: fetch } = require('node-fetch');
const FormData = require('form-data');

async function testFullSystem() {
  console.log('🧪 בדיקת המערכת המלאה עם Supabase Edge Functions...\n');

  const audioFilePath = path.join(__dirname, 'test_input', 'audio1436646319.m4a');
  
  if (!fs.existsSync(audioFilePath)) {
    console.error('❌ קובץ השמע לא נמצא:', audioFilePath);
    return;
  }

  console.log('📁 נמצא קובץ שמע:', audioFilePath);
  const stats = fs.statSync(audioFilePath);
  console.log('📊 גודל קובץ:', (stats.size / 1024 / 1024).toFixed(2), 'MB');
  console.log('⏱️  משך משוער: ~1.8 שעות');

  try {
    // בדיקה 1: בדיקת health
    console.log('\n1. בודק health של השרת...');
    const healthResponse = await fetch('http://localhost:3000/api/health');
    const healthData = await healthResponse.json();
    console.log('   📊 Health status:', healthData.status);
    
    // בדיקה 2: שליחה לAPI המלא (עם Edge Functions)
    console.log('\n2. שולח לAPI המלא עם Edge Functions...');
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioFilePath));
    formData.append('webhookUrl', 'http://localhost:3000/api/webhook/elevenlabs');
    
    console.log('   📤 מעלה קובץ ומתחיל עיבוד...');
    
    const response = await fetch('http://localhost:3000/api/transcribe-real', {
      method: 'POST',
      body: formData
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('   ✅ העלאה הצליחה!');
      console.log('   📋 Task ID:', result.taskId);
      
      // בדיקה 3: מעקב אחר הסטטוס
      console.log('\n3. עוקב אחר התקדמות העיבוד...');
      
      let attempts = 0;
      const maxAttempts = 30; // 5 דקות
      
      while (attempts < maxAttempts) {
        attempts++;
        console.log(`   🔄 בודק סטטוס (ניסיון ${attempts}/${maxAttempts})...`);
        
        const statusResponse = await fetch(`http://localhost:3000/api/status/${result.taskId}`);
        const statusData = await statusResponse.json();
        
        if (statusResponse.ok) {
          console.log(`   📊 סטטוס: ${statusData.status}`);
          console.log(`   📈 התקדמות: ${statusData.progress.completedSegments}/${statusData.progress.totalSegments} קטעים (${statusData.progress.percentage}%)`);
          
          if (statusData.status === 'completed') {
            console.log('\n🎉 התמלול הושלם בהצלחה!');
            console.log('📝 תמלול סופי:');
            console.log('─'.repeat(80));
            console.log(statusData.finalTranscription || 'אין תמלול זמין');
            console.log('─'.repeat(80));
            
            if (statusData.segments && statusData.segments.length > 0) {
              console.log(`\n📋 פירוט קטעים (${statusData.segments.length} קטעים):`);
              statusData.segments.slice(0, 3).forEach((segment, index) => {
                const startMin = Math.floor(segment.startTime / 60);
                const startSec = Math.floor(segment.startTime % 60);
                const endMin = Math.floor(segment.endTime / 60);
                const endSec = Math.floor(segment.endTime % 60);
                console.log(`   ${index + 1}. [${startMin}:${startSec.toString().padStart(2, '0')}-${endMin}:${endSec.toString().padStart(2, '0')}]: ${(segment.transcriptionText || 'אין טקסט').substring(0, 100)}...`);
              });
              
              if (statusData.segments.length > 3) {
                console.log(`   ... ועוד ${statusData.segments.length - 3} קטעים`);
              }
            }
            break;
            
          } else if (statusData.status === 'failed') {
            console.error('   ❌ התמלול נכשל:', statusData.error);
            break;
            
          } else if (statusData.status === 'processing') {
            console.log('   ⏳ עדיין מעבד...');
          }
          
        } else {
          console.error('   ❌ שגיאה בבדיקת סטטוס:', statusData.error);
          break;
        }
        
        // המתנה של 10 שניות
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
      
      if (attempts >= maxAttempts) {
        console.log('\n⏰ הגיע לזמן המקסימלי. המשך לבדוק ידנית:');
        console.log(`   curl http://localhost:3000/api/status/${result.taskId}`);
      }
      
    } else {
      console.error('   ❌ העלאה נכשלה:', result.error);
      console.error('   📄 פרטים:', result.details || 'אין פרטים נוספים');
      
      if (result.error && result.error.includes('Invalid API key')) {
        console.log('\n💡 נראה שיש בעיה עם מפתחות API:');
        console.log('   1. בדוק את SUPABASE_SERVICE_ROLE_KEY ב-.env.local');
        console.log('   2. בדוק את ELEVENLABS_API_KEY');
        console.log('   3. ודא שהטבלאות קיימות במסד הנתונים');
      }
    }

  } catch (error) {
    console.error('❌ שגיאה במהלך הבדיקה:', error.message);
    
    console.log('\n🔧 פתרון בעיות:');
    console.log('1. ודא שהשרת רץ: npm run dev');
    console.log('2. בדוק את קבצי ההגדרה ב-.env.local');
    console.log('3. ודא שSupabase מוגדר נכון');
    console.log('4. בדוק שיש Edge Functions פעילות');
  }

  console.log('\n📋 סיכום הבדיקה:');
  console.log('✅ קובץ הקלט קיים ונגיש');
  console.log('🔧 המערכת כוללת:');
  console.log('   - Next.js API routes');
  console.log('   - Supabase Edge Functions לעיבוד אודיו');
  console.log('   - ElevenLabs Scribe API לתמלול');
  console.log('   - מסד נתונים לניהול משימות');
  console.log('   - Storage לקבצי אודיו');
}

testFullSystem();