#!/usr/bin/env node

// נסה לקבל את ה-service role key מהפרויקט
const { default: fetch } = require('node-fetch');

async function getServiceKey() {
  console.log('🔑 מנסה לקבל service role key...\n');
  
  // הפרויקט שלך
  const projectRef = 'dkzhlqatscxpcdctvbmo';
  
  console.log('📋 פרטי הפרויקט:');
  console.log('   Project URL:', `https://${projectRef}.supabase.co`);
  console.log('   Project Ref:', projectRef);
  
  console.log('\n💡 כדי לקבל את ה-service role key:');
  console.log('1. לך ל: https://supabase.com/dashboard/project/' + projectRef);
  console.log('2. Settings > API');
  console.log('3. העתק את ה-service_role key');
  console.log('4. עדכן את .env.local');
  
  // נסה לבדוק אם המפתח הנוכחי עובד
  const currentKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRremhscWF0c2N4cGNkY3R2Ym1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzQyODU2NSwiZXhwIjoyMDY5MDA0NTY1fQ.Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8';
  
  console.log('\n🧪 בודק מפתח נוכחי...');
  
  try {
    const response = await fetch(`https://${projectRef}.supabase.co/rest/v1/`, {
      headers: {
        'Authorization': `Bearer ${currentKey}`,
        'apikey': currentKey
      }
    });
    
    if (response.ok) {
      console.log('   ✅ המפתח עובד!');
      return currentKey;
    } else {
      console.log('   ❌ המפתח לא עובד:', response.status);
    }
  } catch (error) {
    console.log('   ❌ שגיאה:', error.message);
  }
  
  return null;
}

getServiceKey();