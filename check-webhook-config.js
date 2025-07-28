#!/usr/bin/env node

const https = require('https');

// בדיקת הגדרות webhook
async function checkWebhookConfig() {
  console.log('🔍 בודק הגדרות webhook...');
  console.log('='.repeat(50));

  const API_BASE_URL = 'https://elevenlabs-bridge-henna.vercel.app';
  
  // 1. בדיקת קיום endpoint
  console.log('\n1️⃣ בודק קיום webhook endpoint...');
  
  try {
    const response = await makeRequest(`${API_BASE_URL}/api/webhook/elevenlabs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        task_id: 'test-id',
        status: 'completed',
        result: { text: 'test' }
      })
    });

    if (response.statusCode === 200) {
      console.log('✅ Webhook endpoint קיים ומגיב');
    } else {
      console.log(`❌ Webhook endpoint החזיר: ${response.statusCode}`);
      console.log('📄 תגובה:', response.data);
    }
  } catch (error) {
    console.log('❌ שגיאה בגישה ל-webhook endpoint:', error.message);
  }

  // 2. בדיקת health למידע על webhook
  console.log('\n2️⃣ בודק הגדרת WEBHOOK_BASE_URL...');
  
  try {
    const healthResponse = await makeRequest(`${API_BASE_URL}/api/health`);
    console.log('📊 מידע על הגדרות השרת:');
    console.log(JSON.stringify(healthResponse.data, null, 2));
  } catch (error) {
    console.log('❌ שגיאה בקבלת מידע health:', error.message);
  }

  // 3. הדרכות לבדיקה ידנית
  console.log('\n3️⃣ הדרכות לבדיקה ידנית:');
  console.log('');
  console.log('🔗 קישורים חשובים:');
  console.log(`- Vercel Functions: https://vercel.com/aviz85/elevenlabs-bridge/functions`);
  console.log(`- Vercel Logs: https://vercel.com/aviz85/elevenlabs-bridge/deployments`);
  console.log(`- Environment Variables: https://vercel.com/aviz85/elevenlabs-bridge/settings/environment-variables`);
  
  console.log('\n📋 משתני סביבה נדרשים:');
  console.log('- WEBHOOK_BASE_URL=https://elevenlabs-bridge-henna.vercel.app');
  console.log('- SUPABASE_URL=https://dkzhlqatscxpcdctvbmo.supabase.co');
  console.log('- SUPABASE_ANON_KEY=...');
  console.log('- SUPABASE_SERVICE_ROLE_KEY=...');
  console.log('- ELEVENLABS_API_KEY=...');

  console.log('\n🔍 איך לבדוק אם webhook מגיע:');
  console.log('1. פתח Vercel Functions Dashboard');
  console.log('2. לחץ על "/api/webhook/elevenlabs"');
  console.log('3. בדוק את הלוגים האם יש בקשות POST');
  console.log('4. אם אין בקשות - הבעיה שElevenLabs לא שולח');
  console.log('5. אם יש שגיאות - הבעיה בעיבוד הבקשה');

  console.log('\n💡 טיפים לאבחון:');
  console.log('- בדוק שה-WEBHOOK_BASE_URL מוגדר נכון');
  console.log('- ודא שהשרת מחזיר 200 OK לbקשות webhook');
  console.log('- בדוק שElevenLabs מקבל את ה-webhook URL הנכון');
  console.log('- ודא שאין חסימת CORS או firewall');
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = https.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

checkWebhookConfig().catch(console.error); 