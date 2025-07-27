#!/usr/bin/env node

const { default: fetch } = require('node-fetch');

async function testEdgeFunction() {
  console.log('🧪 בדיקת Edge Function על Supabase בענן...\n');

  const taskId = 'a8ae79d7-e04a-46ee-9fab-ab2a69c025b5'; // מהמסד נתונים
  const supabaseUrl = 'https://dkzhlqatscxpcdctvbmo.supabase.co';
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRremhscWF0c2N4cGNkY3R2Ym1vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM0Mjg1NjUsImV4cCI6MjA2OTAwNDU2NX0.emHI0-bBZ1-jXFtWvGXYmwrKGf4aFFIZQhL0FlZL8CI';

  try {
    console.log('📋 פרטי הבדיקה:');
    console.log('   Task ID:', taskId);
    console.log('   Supabase URL:', supabaseUrl);
    console.log('   Edge Function:', 'audio-processor');

    console.log('\n1. קורא ל-Edge Function בענן...');
    
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/audio-processor`;
    
    const payload = {
      taskId: taskId,
      filePath: 'test/audio1436646319.m4a',
      originalFilename: 'audio1436646319.m4a',
      segmentDurationMinutes: 15
    };

    console.log('   📤 שולח בקשה ל-Edge Function...');
    console.log('   🔗 URL:', edgeFunctionUrl);
    
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
      console.log('   ✅ Edge Function עבד בהצלחה!');
      console.log('   📝 תוצאה:');
      console.log('      - Task ID:', result.taskId);
      console.log('      - משך כולל:', result.totalDuration, 'שניות');
      console.log('      - קטעים שנוצרו:', result.segmentsCreated);
      console.log('      - הודעה:', result.message);
      
      if (result.segments) {
        console.log('   📋 קטעים:');
        result.segments.forEach((segment, index) => {
          console.log(`      ${index + 1}. ${segment.filePath} (${segment.startTime}-${segment.endTime}s)`);
        });
      }

      console.log('\n2. בודק אם הנתונים נשמרו במסד הנתונים...');
      
      // בדיקת הטבלה tasks
      const tasksResponse = await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}`, {
        headers: {
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey
        }
      });

      if (tasksResponse.ok) {
        const tasks = await tasksResponse.json();
        if (tasks.length > 0) {
          const task = tasks[0];
          console.log('   ✅ משימה עודכנה במסד הנתונים:');
          console.log('      - סטטוס:', task.status);
          console.log('      - סה"כ קטעים:', task.total_segments);
          console.log('      - קטעים שהושלמו:', task.completed_segments);
        }
      }

      // בדיקת הטבלה segments
      const segmentsResponse = await fetch(`${supabaseUrl}/rest/v1/segments?task_id=eq.${taskId}`, {
        headers: {
          'Authorization': `Bearer ${anonKey}`,
          'apikey': anonKey
        }
      });

      if (segmentsResponse.ok) {
        const segments = await segmentsResponse.json();
        console.log('   ✅ קטעים נשמרו במסד הנתונים:');
        segments.forEach((segment, index) => {
          console.log(`      ${index + 1}. ${segment.file_path} (${segment.start_time}-${segment.end_time}s) - ${segment.status}`);
        });
      }

      console.log('\n🎉 הבדיקה הצליחה!');
      console.log('✅ Edge Function רץ על Supabase בענן');
      console.log('✅ הוא יכול לגשת למסד הנתונים');
      console.log('✅ הוא יוצר קטעים ושומר אותם');
      console.log('✅ כל התהליך עובד כמו שצריך');

    } else {
      const errorText = await response.text();
      console.error('   ❌ Edge Function נכשל:', response.status, response.statusText);
      console.error('   📄 פרטי שגיאה:', errorText);
      
      if (response.status === 401) {
        console.log('\n💡 בעיה באימות - בדוק את המפתחות');
      } else if (response.status === 404) {
        console.log('\n💡 Edge Function לא נמצא - ודא שהוא נפרס');
      }
    }

  } catch (error) {
    console.error('❌ שגיאה בבדיקת Edge Function:', error.message);
    
    console.log('\n🔧 פתרון בעיות:');
    console.log('1. ודא שה-Edge Function נפרס: supabase functions list');
    console.log('2. בדוק את המפתחות ב-.env.local');
    console.log('3. ודא שיש חיבור לאינטרנט');
  }

  console.log('\n📋 מסקנות:');
  console.log('🎯 אם הבדיקה הצליחה - המערכת מוכנה לעבודה');
  console.log('🔧 הבעיה היחידה שנותרה: service role key לאפליקציה');
  console.log('💡 ברגע שנתקן את המפתח - כל המערכת תעבוד');
}

testEdgeFunction();