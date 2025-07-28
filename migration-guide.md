# מדריך העברת Google Cloud Functions לחשבון אחר

## 🎯 סקירה כללית

העברת השירות לחשבון Google Cloud אחר היא פשוטה כי הכל מבוסס על קוד וקונפיגורציה.

## 📋 מה צריך להעביר:

### 1. **הקוד** (כבר מוכן)
```
google-audio-splitter/
├── index.js          # הקוד המלא
├── package.json      # התלויות
├── .gcloudignore     # קבצים להתעלמות
└── README.md         # תיעוד
```

### 2. **Google Cloud Storage Bucket**
- Bucket name: `elevenlabs-audio-segments`
- הרשאות: public read
- מיקום: us-central1

### 3. **Google Cloud Functions**
- `health` - בדיקת תקינות
- `splitAudio` - פיצול אודיו

---

## 🚀 תהליך ההעברה (צעד אחר צעד)

### שלב 1: הכנת החשבון החדש

```bash
# 1. התחברות לחשבון החדש
gcloud auth login

# 2. יצירת פרויקט חדש (או שימוש בקיים)
gcloud projects create YOUR-NEW-PROJECT-ID
gcloud config set project YOUR-NEW-PROJECT-ID

# 3. הפעלת APIs נדרשים
gcloud services enable cloudfunctions.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable run.googleapis.com
```

### שלב 2: יצירת Storage Bucket

```bash
# יצירת bucket חדש
gsutil mb gs://YOUR-NEW-BUCKET-NAME

# הגדרת הרשאות ציבוריות
gsutil iam ch allUsers:objectViewer gs://YOUR-NEW-BUCKET-NAME
```

### שלב 3: עדכון הקוד

```javascript
// עדכון google-audio-splitter/index.js
const BUCKET_NAME = process.env.STORAGE_BUCKET || 'YOUR-NEW-BUCKET-NAME';
```

### שלב 4: פריסת Functions

```bash
cd google-audio-splitter

# פריסת health function
gcloud functions deploy health \
  --runtime nodejs18 \
  --trigger-http \
  --memory 256MB \
  --timeout 60s \
  --allow-unauthenticated \
  --region us-central1

# פריסת splitAudio function
gcloud functions deploy splitAudio \
  --runtime nodejs18 \
  --trigger-http \
  --memory 2GB \
  --timeout 540s \
  --allow-unauthenticated \
  --region us-central1 \
  --set-env-vars STORAGE_BUCKET=YOUR-NEW-BUCKET-NAME
```

---

## 🔧 סקריפט אוטומטי להעברה

```bash
#!/bin/bash
# migrate-to-new-account.sh

echo "🚀 מתחיל העברה לחשבון Google Cloud חדש..."

# קבלת פרטים מהמשתמש
read -p "הכנס Project ID חדש: " NEW_PROJECT_ID
read -p "הכנס שם Bucket חדש: " NEW_BUCKET_NAME
read -p "הכנס Region (default: us-central1): " REGION
REGION=${REGION:-us-central1}

echo "📋 פרטי ההעברה:"
echo "   Project: $NEW_PROJECT_ID"
echo "   Bucket: $NEW_BUCKET_NAME"
echo "   Region: $REGION"

read -p "האם להמשיך? (y/N): " CONFIRM
if [[ $CONFIRM != "y" ]]; then
    echo "❌ ההעברה בוטלה"
    exit 1
fi

# הגדרת פרויקט
echo "🔧 מגדיר פרויקט..."
gcloud config set project $NEW_PROJECT_ID

# הפעלת APIs
echo "🔌 מפעיל APIs..."
gcloud services enable cloudfunctions.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable run.googleapis.com

# יצירת bucket
echo "🪣 יוצר Storage bucket..."
gsutil mb gs://$NEW_BUCKET_NAME
gsutil iam ch allUsers:objectViewer gs://$NEW_BUCKET_NAME

# עדכון קוד
echo "📝 מעדכן קוד..."
sed -i.bak "s/elevenlabs-audio-segments/$NEW_BUCKET_NAME/g" google-audio-splitter/index.js

# פריסת functions
echo "☁️ פורס Functions..."
cd google-audio-splitter

gcloud functions deploy health \
  --runtime nodejs18 \
  --trigger-http \
  --memory 256MB \
  --timeout 60s \
  --allow-unauthenticated \
  --region $REGION

gcloud functions deploy splitAudio \
  --runtime nodejs18 \
  --trigger-http \
  --memory 2GB \
  --timeout 540s \
  --allow-unauthenticated \
  --region $REGION \
  --set-env-vars STORAGE_BUCKET=$NEW_BUCKET_NAME

cd ..

# בדיקת תקינות
echo "🧪 בודק תקינות..."
NEW_HEALTH_URL="https://$REGION-$NEW_PROJECT_ID.cloudfunctions.net/health"
curl -s $NEW_HEALTH_URL | jq .

echo "✅ ההעברה הושלמה בהצלחה!"
echo "🔗 URLs חדשים:"
echo "   Health: $NEW_HEALTH_URL"
echo "   Split Audio: https://$REGION-$NEW_PROJECT_ID.cloudfunctions.net/splitAudio"
```

---

## 📊 השוואת עלויות בין חשבונות

### חשבון נוכחי (dreemz-whatsapp-mentor):
- Project ID: `dreemz-whatsapp-mentor`
- Region: `us-central1`
- Bucket: `elevenlabs-audio-segments`

### חשבון חדש:
- Project ID: `YOUR-NEW-PROJECT`
- Region: `us-central1` (מומלץ)
- Bucket: `YOUR-NEW-BUCKET`

**עלויות זהות** - אין הבדל בתמחור בין חשבונות.

---

## 🔄 תהליך העברה מומלץ

### אפשרות 1: העברה מיידית
1. יצירת חשבון חדש
2. פריסת השירות
3. עדכון האפליקציה
4. מחיקת השירות הישן

### אפשרות 2: העברה הדרגתית (מומלץ)
1. פריסה בחשבון החדש
2. בדיקות מקבילות
3. העברה הדרגתית של תעבורה
4. מחיקת השירות הישן

---

## 🛡️ גיבוי ושחזור

### לפני ההעברה:
```bash
# גיבוי קוד
tar -czf google-cloud-functions-backup.tar.gz google-audio-splitter/

# גיבוי הגדרות
gcloud functions describe splitAudio --region us-central1 > splitAudio-config.yaml
gcloud functions describe health --region us-central1 > health-config.yaml
```

### אחרי ההעברה:
```bash
# בדיקת תקינות
curl https://NEW-REGION-NEW-PROJECT.cloudfunctions.net/health

# בדיקת פיצול (עם קובץ קטן)
curl -X POST https://NEW-REGION-NEW-PROJECT.cloudfunctions.net/splitAudio \
  -H "Content-Type: application/json" \
  -d '{"audioUrl": "https://example.com/test.mp3", "segmentDurationMinutes": 1}'
```

---

## 💡 טיפים חשובים

### 1. **שמירת URLs**
עדכן את האפליקציה עם URLs החדשים:
```javascript
const GOOGLE_FUNCTION_URL = process.env.GOOGLE_FUNCTION_URL || 
  'https://us-central1-NEW-PROJECT.cloudfunctions.net/splitAudio';
```

### 2. **Environment Variables**
```bash
# .env.local
GOOGLE_CLOUD_PROJECT=NEW-PROJECT-ID
GOOGLE_FUNCTION_URL=https://us-central1-NEW-PROJECT.cloudfunctions.net/splitAudio
GOOGLE_STORAGE_BUCKET=NEW-BUCKET-NAME
```

### 3. **DNS/Domain**
אם יש לך domain מותאם, עדכן את ה-CNAME records.

### 4. **Monitoring**
הגדר monitoring בחשבון החדש:
```bash
gcloud logging sinks create audio-splitter-logs \
  storage.googleapis.com/NEW-BUCKET-NAME/logs
```

---

## ✅ Checklist להעברה

- [ ] חשבון Google Cloud חדש מוכן
- [ ] Project ID נבחר
- [ ] APIs מופעלים
- [ ] Storage bucket נוצר
- [ ] קוד עודכן עם bucket חדש
- [ ] Functions נפרסו
- [ ] בדיקות תקינות עברו
- [ ] האפליקציה עודכנה עם URLs חדשים
- [ ] השירות הישן נמחק (אחרי אישור)

---

## 🎯 מתי לעשות את ההעברה?

**עכשיו (מומלץ):**
- השירות עדיין בפיתוח
- אין משתמשים בפרודקשן
- קל לעשות שינויים

**מאוחר יותר:**
- צריך תיאום עם משתמשים
- גיבויים נוספים
- תהליך מורכב יותר

רוצה שאכין סקריפט אוטומטי להעברה? 🚀