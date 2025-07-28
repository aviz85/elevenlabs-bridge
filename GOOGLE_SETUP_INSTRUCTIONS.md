# 🚀 מעבר ל-Google Cloud Functions - הוראות מלאות

## שלב 1: הגדרת משתני סביבה

צור קובץ `.env.local` בשורש הפרוייקט עם התוכן הבא:

```bash
# Supabase Configuration (עדיין נדרש למסד הנתונים)
SUPABASE_URL=https://your-supabase-url.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# ElevenLabs Configuration
ELEVENLABS_API_KEY=your-elevenlabs-api-key

# Google Cloud Functions - המעבר ל-Google! 🎉
USE_GOOGLE_CLOUD_FUNCTIONS=true

# בחר אחת מהאפשרויות:
# Production Google Function:
GOOGLE_CLOUD_FUNCTION_URL=https://us-central1-dreemz-whatsapp-mentor.cloudfunctions.net/splitAudio

# או Google Function מקומי (אם רץ על port 8080):
# GOOGLE_CLOUD_FUNCTION_URL=http://localhost:8080

# App Configuration
WEBHOOK_BASE_URL=http://localhost:3000
MAX_CONCURRENT_REQUESTS=4
SEGMENT_DURATION_MINUTES=15
CLEANUP_INTERVAL_HOURS=24
```

## שלב 2: בדיקת Google Function

וודא שה-Google Function עובד:

```bash
# בדיקת health:
curl https://us-central1-dreemz-whatsapp-mentor.cloudfunctions.net/health

# או Function מקומי:
curl http://localhost:8080/health
```

## שלב 3: הפעלת המערכת

```bash
# הפעל את השרת עם המשתני החדשים:
npm run dev
```

## שלב 4: בדיקת הקובץ שלך

```bash
# בדוק שהמערכת עובדת עם Google:
curl -X POST http://localhost:3000/api/transcribe-real \
  -F "file=@test_input/audio1436646319.m4a" \
  -F "webhookUrl=https://webhook.site/your-webhook-id"
```

## 🎯 מה יקרה עכשיו:

1. ✅ הקובץ יועלה ל-Supabase Storage
2. ✅ signed URL ייווצר לקובץ
3. 🆕 **Google Cloud Function יורד את הקובץ**
4. 🆕 **FFmpeg של Google יפצל את הקובץ**
5. 🆕 **קטעים יישמרו ב-Google Cloud Storage**
6. ✅ URLs יוחזרו למערכת
7. ✅ ElevenLabs יקבל את הקטעים לתמלול

## 🔄 מעבר בין האפשרויות:

### לחזור ל-Supabase:
```bash
USE_GOOGLE_CLOUD_FUNCTIONS=false
```

### לעבור ל-Google מקומי:
```bash
USE_GOOGLE_CLOUD_FUNCTIONS=true
GOOGLE_CLOUD_FUNCTION_URL=http://localhost:8080
```

### לעבור ל-Google production:
```bash
USE_GOOGLE_CLOUD_FUNCTIONS=true  
GOOGLE_CLOUD_FUNCTION_URL=https://us-central1-dreemz-whatsapp-mentor.cloudfunctions.net/splitAudio
```

## 💡 טיפים:

- השתמש ב-Google מקומי לפיתוח (מהיר יותר)
- השתמש ב-Google production ל-production
- Google זול פי 5-10 מ-Supabase לעיבוד אודיו
- כל השאר נשאר אותו דבר - מסד נתונים, webhooks, וכו' 