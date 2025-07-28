# 🧪 מדריך בדיקה מקיף לפייפליין התמלול

## 📋 כלי הבדיקה שנוצרו:

### 1. `test-complete-pipeline.js` - בדיקה מלאה של הפייפליין
**מה זה עושה:** בודק את כל השלבים מתחילה ועד סוף
```bash
node test-complete-pipeline.js
```

**כולל:**
- ✅ בדיקת תקינות השרת
- ✅ שליחת בקשת תמלול
- ✅ מעקב אחר סטטוס המשימה
- ✅ בדיקת webhook configuration
- ✅ מוניטורינג התקדמות התמלול (עד 20 דקות)
- ✅ סיכום מלא

### 2. `check-webhook-config.js` - בדיקת הגדרות webhook
**מה זה עושה:** מאבחן בעיות webhook ו-WEBHOOK_BASE_URL
```bash
node check-webhook-config.js
```

**כולל:**
- 🔍 בדיקת קיום webhook endpoint
- 🔍 בדיקת הגדרת WEBHOOK_BASE_URL  
- 🔍 הדרכות לבדיקה ידנית
- 🔍 קישורים לVercel Dashboard

### 3. `check-google-integration.js` - בדיקת Google Cloud Functions
**מה זה עושה:** בודק שהאינטגרציה עם Google עובדת
```bash
node check-google-integration.js
```

**כולל:**
- ☁️ בדיקת health של Google Cloud Function
- ☁️ בדיקת קיום הקובץ ב-Google Cloud Storage
- ☁️ בדיקת פיצול אודיו ישירות
- ☁️ בדיקת נגישות החתיכות

## 🔄 סדר הבדיקות המומלץ:

### שלב 1: בדיקה בסיסית
```bash
# בדוק שGoogle Cloud Functions עובד
node check-google-integration.js

# בדוק הגדרת webhook
node check-webhook-config.js
```

### שלב 2: בדיקה מלאה
```bash
# רוץ את הפייפליין המלא
node test-complete-pipeline.js
```

## 🚨 אבחון בעיות נפוצות:

### בעיה 1: "השרת לא תקין" (503 Service Unavailable)
**סיבה:** חסרים משתני סביבה ב-Vercel  
**פתרון:** הוסף את המשתנים הבאים ל-Vercel:
```
SUPABASE_URL=https://dkzhlqatscxpcdctvbmo.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
ELEVENLABS_API_KEY=sk_a5746e4a783085ae9ff0a56ba9b9adace478590eb0fabcc6
WEBHOOK_BASE_URL=https://elevenlabs-bridge-henna.vercel.app
```

### בעיה 2: "חתיכות נשארות בstatus pending"
**סיבה:** ElevenLabs לא מחזיר webhooks  
**אבחון:**
1. בדוק שWEBHOOK_BASE_URL מוגדר נכון
2. עבור ל-Vercel Functions Dashboard
3. בדוק לוגים של `/api/webhook/elevenlabs`
4. אם אין בקשות POST - הבעיה בElevenLabs
5. אם יש שגיאות - הבעיה בעיבוד

### בעיה 3: "Google Cloud Functions לא עובד"
**אבחון:**
```bash
node check-google-integration.js
```
**פתרון:** אם הבדיקה נכשלת, הבעיה ב:
- חיבור לGoogle Cloud Functions
- הגדרות Google Cloud Storage  
- קובץ האודיו המקורי

### בעיה 4: "arrayBuffer is not a function"
**סיבה:** בעיה במבנה הקוד (כבר תוקנה)  
**פתרון:** ודא שהקוד מעודכן

## 📊 מה אמור לקרות בפייפליין תקין:

### שלב 1: פיצול האודיו (Google Cloud Functions)
- הקובץ (66MB, 107 דקות) מפוצל ל-8 חתיכות
- כל חתיכה 15 דקות (~13.7MB)
- זמן עיבוד: ~100 שניות
- החתיכות נשמרות ב-Google Cloud Storage

### שלב 2: שמירה במסד נתונים (Supabase)
- נוצרת משימה חדשה עם taskId
- נוצרות 8 רשומות segments במסד הנתונים
- סטטוס התחלתי: "pending"

### שלב 3: שליחה ל-ElevenLabs
- כל חתיכה נשלחת בנפרד ל-ElevenLabs API
- מוגדר webhook URL לכל חתיכה
- ElevenLabs מתחיל לתמלל באופן אסינכרוני

### שלב 4: קבלת webhooks מ-ElevenLabs
- כשחתיכה מסתיימת, ElevenLabs שולח POST ל:
  `https://elevenlabs-bridge-henna.vercel.app/api/webhook/elevenlabs`
- הסרבר מעדכן את הsegment ל"completed"
- התמלול נשמר במסד הנתונים

### שלב 5: הרכבת התוצאה הסופית
- כשכל החתיכות מסתיימות (8/8)
- התמלולים מחוברים לפי סדר הזמן
- התוצאה הסופית נשמרת

### שלב 6: שליחת webhook ללקוח
- התוצאה המלאה נשלחת ל-webhook URL שהלקוח סיפק
- הסטטוס מתעדכן ל"completed"

## 🎯 זמני הפייפליין הצפויים:

- **פיצול אודיו:** ~2 דקות
- **תמלול ElevenLabs:** 3-5 דקות לחתיכה (24-40 דקות סה"כ)
- **הרכבת תוצאות:** ~30 שניות
- **סה"כ:** 25-45 דקות

## 🔗 קישורים חשובים:

- **Vercel Dashboard:** https://vercel.com/aviz85/elevenlabs-bridge
- **Environment Variables:** https://vercel.com/aviz85/elevenlabs-bridge/settings/environment-variables
- **Function Logs:** https://vercel.com/aviz85/elevenlabs-bridge/functions
- **Google Cloud Function:** https://us-central1-dreemz-whatsapp-mentor.cloudfunctions.net/splitAudio

## 💡 טיפים לבדיקה יעילה:

1. **תמיד התחל בסיסי:** רוץ את `check-google-integration.js` ו-`check-webhook-config.js` לפני הפייפליין המלא

2. **השתמש בלוגי Vercel:** פתח את Functions Dashboard ובדוק לוגים בזמן אמת

3. **בדוק משתני סביבה:** ודא שכל 5 המשתנים מוגדרים בVercel

4. **סבלנות:** התמלול לוקח זמן - עד 45 דקות לקובץ של 107 דקות

5. **בדוק webhook:** השתמש בhttpbin.org או webhook.site לראות מה נשלח

## 🆘 אם הכל נכשל:

1. בדוק את לוגי Vercel
2. ודא שכל משתני הסביבה מוגדרים
3. רוץ `node check-google-integration.js` - אם זה עובד, הבעיה בVercel
4. בדוק שה-WEBHOOK_BASE_URL נכון
5. נסה עם קובץ קטן יותר קודם

## ✅ סיכום מהיר - מה צריך לעבוד:

- [ ] Google Cloud Functions (בדוק עם `check-google-integration.js`)
- [ ] Webhook endpoint (בדוק עם `check-webhook-config.js`)  
- [ ] משתני סביבה בVercel (5 משתנים)
- [ ] מסד נתונים Supabase מחובר
- [ ] ElevenLabs API פעיל
- [ ] פייפליין מלא (בדוק עם `test-complete-pipeline.js`)

**אחרי שהכל עובד - הקובץ שלך (66MB) יתומלל אוטומטית! 🎉** 