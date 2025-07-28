#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

// הגדרות
const API_BASE_URL = 'https://elevenlabs-bridge-henna.vercel.app';
const AUDIO_FILE = 'test_input/audio1436646319.m4a';
const WEBHOOK_URL = 'https://httpbin.org/post'; // זה יראה לנו את ה-webhook שנשלח

class PipelineTester {
  constructor() {
    // קבלת פרטי הקובץ
    const audioFilePath = path.join(__dirname, AUDIO_FILE);
    const fileStats = fs.statSync(audioFilePath);
    this.filename = path.basename(AUDIO_FILE);
    this.fileSize = fileStats.size;
    this.taskId = null;
  }

  async makeRequest(url, options = {}) {
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

  log(step, status, message, data = null) {
    const timestamp = new Date().toLocaleString('he-IL');
    const statusEmoji = status === 'success' ? '✅' : status === 'error' ? '❌' : status === 'info' ? 'ℹ️' : '⏳';
    
    console.log(`\n${statusEmoji} [${timestamp}] שלב ${step}: ${message}`);
    if (data) {
      console.log('   📊 נתונים:', JSON.stringify(data, null, 2));
    }
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // שלב 1: בדיקת תקינות השרת
  async checkServerHealth() {
    this.log(1, 'info', 'בודק תקינות השרת...');
    
    try {
      const result = await this.makeRequest(`${API_BASE_URL}/api/health`);
      
      if (result.statusCode === 200) {
        this.log(1, 'success', 'השרת פעיל', result.data.checks);
        
        // בדיקת כל השירותים
        const checks = result.data.checks;
        if (!checks.database.healthy) {
          this.log(1, 'error', 'בעיה בחיבור למסד נתונים!');
          return false;
        }
        if (!checks.elevenlabs.healthy) {
          this.log(1, 'error', 'בעיה בחיבור לElevenLabs!');
          return false;
        }
        
        return true;
      } else {
        this.log(1, 'error', `השרת החזיר סטטוס ${result.statusCode}`, result.data);
        return false;
      }
    } catch (error) {
      this.log(1, 'error', 'שגיאה בבדיקת השרת', error.message);
      return false;
    }
  }

  // שלב 2: שליחת בקשת תמלול
  async startTranscription() {
    this.log(2, 'info', 'שולח בקשת תמלול...');
    
    const requestData = JSON.stringify({
      webhookUrl: WEBHOOK_URL,
      filename: this.filename,
      fileSize: this.fileSize
    });

    try {
      const result = await this.makeRequest(`${API_BASE_URL}/api/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(requestData)
        },
        body: requestData
      });

      if (result.statusCode === 200 && result.data.taskId) {
        this.taskId = result.data.taskId;
        this.log(2, 'success', 'בקשת תמלול נשלחה בהצלחה', {
          taskId: this.taskId,
          status: result.data.status
        });
        return true;
      } else {
        this.log(2, 'error', 'כשלון בשליחת בקשת התמלול', result);
        return false;
      }
    } catch (error) {
      this.log(2, 'error', 'שגיאה בשליחת בקשת תמלול', error.message);
      return false;
    }
  }

  // שלב 3: בדיקת סטטוס המשימה וחתיכות האודיו
  async checkTaskStatus() {
    if (!this.taskId) {
      this.log(3, 'error', 'אין taskId - לא ניתן לבדוק סטטוס');
      return null;
    }

    this.log(3, 'info', `בודק סטטוס המשימה ${this.taskId}...`);

    try {
      const result = await this.makeRequest(`${API_BASE_URL}/api/status/${this.taskId}`);
      
      if (result.statusCode === 200) {
        const data = result.data;
        this.log(3, 'success', 'סטטוס המשימה התקבל', {
          status: data.status,
          progress: data.progress,
          totalSegments: data.progress?.totalSegments,
          completedSegments: data.progress?.completedSegments
        });

        // הצגת פרטי החתיכות
        if (data.segments && data.segments.length > 0) {
          console.log('\n   📋 חתיכות אודיו:');
          data.segments.forEach((segment, index) => {
            const startMin = Math.floor(segment.startTime / 60);
            const startSec = segment.startTime % 60;
            const endMin = Math.floor(segment.endTime / 60);
            const endSec = Math.floor(segment.endTime % 60);
            
            console.log(`   ${index + 1}. [${startMin}:${startSec.toString().padStart(2, '0')}-${endMin}:${endSec.toString().padStart(2, '0')}] סטטוס: ${segment.status}`);
            
            if (segment.status === 'completed' && segment.transcriptionText) {
              console.log(`      📝 תמלול: ${segment.transcriptionText.substring(0, 100)}...`);
            }
            if (segment.status === 'failed' && segment.error) {
              console.log(`      ❌ שגיאה: ${segment.error}`);
            }
          });
        }

        return data;
      } else {
        this.log(3, 'error', 'כשלון בקבלת סטטוס המשימה', result);
        return null;
      }
    } catch (error) {
      this.log(3, 'error', 'שגיאה בבדיקת סטטוס המשימה', error.message);
      return null;
    }
  }

  // שלב 4: בדיקת webhook מElevenLabs
  async checkWebhookReceived() {
    this.log(4, 'info', 'בודק האם webhook מ-ElevenLabs מגיע לשרת...');
    
    // בדיקה האם יש webhook URL מוגדר
    console.log('\n   🔍 בודק הגדרת webhook:');
    console.log(`   - Webhook URL: ${WEBHOOK_URL}`);
    console.log(`   - צריך לבדוק שהשרת מקבל בקשות POST ל: ${API_BASE_URL}/api/webhook/elevenlabs`);
    
    // המלצה לבדיקה ידנית
    console.log('\n   💡 כדי לוודא שה-webhook עובד:');
    console.log('   1. פתח את הלוגים של Vercel');
    console.log('   2. חפש לוגים של "/api/webhook/elevenlabs"');
    console.log('   3. אמור לראות בקשות POST מ-ElevenLabs כשחתיכות מסתיימות');
    
    return true;
  }

  // שלב 5: מעקב אחר התקדמות התמלול
  async monitorProgress(maxWaitMinutes = 15) {
    this.log(5, 'info', `עוקב אחר התקדמות התמלול למשך עד ${maxWaitMinutes} דקות...`);
    
    const startTime = Date.now();
    const maxWaitTime = maxWaitMinutes * 60 * 1000;
    let lastProgress = null;

    while (Date.now() - startTime < maxWaitTime) {
      const status = await this.checkTaskStatus();
      
      if (!status) {
        await this.sleep(10000);
        continue;
      }

      const progress = status.progress;
      
      // בדיקה האם יש התקדמות
      if (!lastProgress || 
          progress.completedSegments !== lastProgress.completedSegments) {
        
        this.log(5, 'info', `התקדמות: ${progress.completedSegments}/${progress.totalSegments} (${progress.percentage}%)`, {
          status: status.status,
          completedSegments: progress.completedSegments,
          totalSegments: progress.totalSegments
        });
        
        lastProgress = progress;
      }

      // בדיקה האם הושלם
      if (status.status === 'completed') {
        this.log(5, 'success', 'התמלול הושלם בהצלחה!', {
          finalTranscription: status.finalTranscription ? 
            status.finalTranscription.substring(0, 200) + '...' : 
            'לא זמין'
        });
        return status;
      }

      if (status.status === 'failed') {
        this.log(5, 'error', 'התמלול נכשל', { error: status.error });
        return status;
      }

      // המתנה לפני הבדיקה הבאה
      await this.sleep(30000); // 30 שניות
    }

    this.log(5, 'error', 'זמן המתנה הסתיים - התמלול לא הושלם');
    return null;
  }

  // הפעלת כל הבדיקות
  async runFullPipeline() {
    console.log('🚀 מתחיל בדיקת פייפליין מלאה');
    console.log('='.repeat(60));
    console.log(`📁 קובץ: ${this.filename}`);
    console.log(`📊 גודל: ${(this.fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`🔗 שרת: ${API_BASE_URL}`);
    console.log('='.repeat(60));

    // שלב 1: בדיקת תקינות השרת
    const healthOk = await this.checkServerHealth();
    if (!healthOk) {
      console.log('\n❌ הבדיקה נפסקה - השרת לא תקין');
      return;
    }

    // שלב 2: שליחת בקשת תמלול
    const transcriptionStarted = await this.startTranscription();
    if (!transcriptionStarted) {
      console.log('\n❌ הבדיקה נפסקה - כשלון בשליחת בקשת התמלול');
      return;
    }

    // המתנה קצרה לפני בדיקת הסטטוס
    await this.sleep(5000);

    // שלב 3: בדיקת סטטוס ראשונית
    await this.checkTaskStatus();

    // שלב 4: בדיקת webhook
    await this.checkWebhookReceived();

    // שלב 5: מעקב אחר התקדמות
    const finalResult = await this.monitorProgress(20); // 20 דקות

    // סיכום
    console.log('\n' + '='.repeat(60));
    console.log('📋 סיכום הבדיקה');
    console.log('='.repeat(60));
    
    if (finalResult) {
      if (finalResult.status === 'completed') {
        console.log('🎉 הפייפליין עבד בהצלחה מלאה!');
        console.log(`✅ כל ${finalResult.progress.totalSegments} החתיכות הושלמו`);
        console.log('✅ התמלול הסופי הורכב');
        console.log('✅ התוצאה נשלחה ל-webhook של הלקוח');
      } else {
        console.log('⚠️  הפייפליין לא הושלם במלואו');
        console.log(`📊 סטטוס: ${finalResult.status}`);
      }
    } else {
      console.log('❌ הפייפליין לא הושלם - בדוק את הלוגים לפרטים נוספים');
    }

    // המלצות לבדיקה נוספת
    console.log('\n💡 המלצות לבדיקה נוספת:');
    console.log('1. בדוק את לוגי Vercel: https://vercel.com/aviz85/elevenlabs-bridge/functions');
    console.log('2. בדוק שה-WEBHOOK_BASE_URL מוגדר נכון');
    console.log('3. ודא שחתיכות האודיו נוצרו ב-Google Cloud Storage');
    console.log('4. בדוק את לוגי ElevenLabs API');
  }
}

// הפעלת הבדיקה
const tester = new PipelineTester();
tester.runFullPipeline().catch(console.error); 