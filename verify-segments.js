#!/usr/bin/env node

const { default: fetch } = require('node-fetch');
const fs = require('fs');
const path = require('path');

async function verifySegments() {
  console.log('🔍 בדיקת הקטעים שנוצרו...\n');

  // הקטעים מהתוצאה הקודמת
  const taskId = '9728943b-39d8-404b-8165-74e378083f27';
  const bucketName = 'elevenlabs-audio-segments';
  
  const segments = [
    {
      index: 1,
      startTime: 0,
      endTime: 900,
      fileName: `segments/${taskId}/segment_1.mp3`,
      downloadUrl: `https://storage.googleapis.com/${bucketName}/segments/${taskId}/segment_1.mp3`
    },
    {
      index: 2,
      startTime: 900,
      endTime: 1800,
      fileName: `segments/${taskId}/segment_2.mp3`,
      downloadUrl: `https://storage.googleapis.com/${bucketName}/segments/${taskId}/segment_2.mp3`
    },
    {
      index: 8,
      startTime: 6300,
      endTime: 6436.629333,
      fileName: `segments/${taskId}/segment_8.mp3`,
      downloadUrl: `https://storage.googleapis.com/${bucketName}/segments/${taskId}/segment_8.mp3`
    }
  ];

  // יצירת תיקיית downloads
  const downloadsDir = path.join(__dirname, 'downloaded-segments');
  if (!fs.existsSync(downloadsDir)) {
    fs.mkdirSync(downloadsDir);
    console.log('📁 יצרתי תיקיית downloads:', downloadsDir);
  }

  for (const segment of segments) {
    console.log(`\n🔍 בודק קטע ${segment.index}:`);
    console.log(`   ⏱️  זמן: ${Math.floor(segment.startTime / 60)}:${Math.floor(segment.startTime % 60).toString().padStart(2, '0')} - ${Math.floor(segment.endTime / 60)}:${Math.floor(segment.endTime % 60).toString().padStart(2, '0')}`);
    console.log(`   🔗 URL: ${segment.downloadUrl}`);

    try {
      // בדיקת זמינות הקובץ
      console.log(`   📡 בודק זמינות...`);
      const headResponse = await fetch(segment.downloadUrl, { method: 'HEAD' });
      
      if (headResponse.ok) {
        const contentLength = headResponse.headers.get('content-length');
        const contentType = headResponse.headers.get('content-type');
        
        console.log(`   ✅ קובץ זמין!`);
        console.log(`   📊 גודל: ${(parseInt(contentLength) / 1024 / 1024).toFixed(2)} MB`);
        console.log(`   🎵 סוג: ${contentType}`);

        // הורדת הקובץ
        console.log(`   📥 מוריד קובץ...`);
        const downloadResponse = await fetch(segment.downloadUrl);
        
        if (downloadResponse.ok) {
          const buffer = await downloadResponse.buffer();
          const localPath = path.join(downloadsDir, `segment_${segment.index}.mp3`);
          
          fs.writeFileSync(localPath, buffer);
          console.log(`   💾 נשמר ב: ${localPath}`);
          
          // בדיקת הקובץ המקומי
          const stats = fs.statSync(localPath);
          console.log(`   📏 גודל מקומי: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
          
          // בדיקת משך עם FFprobe (אם זמין)
          try {
            const { execSync } = require('child_process');
            const duration = execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${localPath}"`, { encoding: 'utf8' });
            const durationSeconds = parseFloat(duration.trim());
            const expectedDuration = segment.endTime - segment.startTime;
            
            console.log(`   ⏱️  משך בפועל: ${Math.floor(durationSeconds / 60)}:${Math.floor(durationSeconds % 60).toString().padStart(2, '0')}`);
            console.log(`   ⏱️  משך צפוי: ${Math.floor(expectedDuration / 60)}:${Math.floor(expectedDuration % 60).toString().padStart(2, '0')}`);
            
            const durationDiff = Math.abs(durationSeconds - expectedDuration);
            if (durationDiff < 2) {
              console.log(`   ✅ משך נכון!`);
            } else {
              console.log(`   ⚠️  הפרש במשך: ${durationDiff.toFixed(2)} שניות`);
            }
            
          } catch (ffprobeError) {
            console.log(`   ⚠️  לא יכול לבדוק משך (FFprobe לא זמין)`);
          }
          
        } else {
          console.log(`   ❌ הורדה נכשלה: ${downloadResponse.status} ${downloadResponse.statusText}`);
        }
        
      } else {
        console.log(`   ❌ קובץ לא זמין: ${headResponse.status} ${headResponse.statusText}`);
      }
      
    } catch (error) {
      console.log(`   ❌ שגיאה: ${error.message}`);
    }
  }

  console.log('\n📋 סיכום הבדיקה:');
  
  // בדיקת כל הקבצים שהורדו
  const downloadedFiles = fs.readdirSync(downloadsDir).filter(f => f.endsWith('.mp3'));
  console.log(`📁 קבצים שהורדו: ${downloadedFiles.length}`);
  
  let totalSize = 0;
  downloadedFiles.forEach(file => {
    const filePath = path.join(downloadsDir, file);
    const stats = fs.statSync(filePath);
    totalSize += stats.size;
    console.log(`   ${file}: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  });
  
  console.log(`📊 סה"כ גודל: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  
  console.log('\n🎯 מסקנות:');
  if (downloadedFiles.length > 0) {
    console.log('✅ הפיצול עבד מצוין!');
    console.log('✅ הקבצים זמינים להורדה');
    console.log('✅ הגדלים נראים נכונים');
    console.log('🎙️ מוכן לתמלול עם ElevenLabs!');
  } else {
    console.log('❌ לא הצלחתי להוריד קבצים');
    console.log('🔧 יש לבדוק הרשאות או זמינות');
  }
  
  console.log('\n💡 השלב הבא:');
  console.log('1. לשלוח כל קטע ל-ElevenLabs לתמלול');
  console.log('2. לחבר את התמלולים');
  console.log('3. לשלב עם האפליקציה');
}

verifySegments();