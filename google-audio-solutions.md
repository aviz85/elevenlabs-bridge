# Google Cloud - פתרונות לעיבוד אודיו

## 🌟 Google Cloud Functions (הכי דומה ל-AWS Lambda)

### יתרונות על פני AWS:
- ✅ **ממשק פשוט יותר** - פחות מורכבות
- ✅ **תמחור שקוף** - $0.40/מיליון בקשות
- ✅ **זמן קר מהיר** - מתחיל מהר יותר
- ✅ **אינטגרציה מעולה** עם Google Services
- ✅ **תמיכה מובנית ב-FFmpeg** (דרך buildpacks)

### דוגמת מימוש:
```javascript
// Google Cloud Function
const functions = require('@google-cloud/functions-framework');
const { Storage } = require('@google-cloud/storage');
const { execSync } = require('child_process');
const fs = require('fs');

functions.http('splitAudio', async (req, res) => {
  try {
    const { audioUrl, segmentDuration = 900 } = req.body;
    
    // Download from Google Cloud Storage
    const storage = new Storage();
    const inputFile = '/tmp/input.m4a';
    await storage.bucket('audio-input').file('audio.m4a').download({
      destination: inputFile
    });
    
    // Get duration with ffprobe
    const duration = parseFloat(
      execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${inputFile}"`)
        .toString().trim()
    );
    
    // Split audio
    const segments = [];
    const numSegments = Math.ceil(duration / segmentDuration);
    
    for (let i = 0; i < numSegments; i++) {
      const startTime = i * segmentDuration;
      const outputFile = `/tmp/segment_${i + 1}.mp3`;
      
      execSync(`ffmpeg -i "${inputFile}" -ss ${startTime} -t ${segmentDuration} -acodec mp3 -y "${outputFile}"`);
      
      // Upload segment to Cloud Storage
      await storage.bucket('audio-segments').upload(outputFile, {
        destination: `segments/segment_${i + 1}.mp3`
      });
      
      segments.push({
        index: i + 1,
        url: `gs://audio-segments/segments/segment_${i + 1}.mp3`,
        startTime,
        endTime: Math.min((i + 1) * segmentDuration, duration)
      });
    }
    
    res.json({
      success: true,
      totalDuration: duration,
      segments
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### פריסה:
```bash
# package.json
{
  "name": "audio-splitter",
  "dependencies": {
    "@google-cloud/functions-framework": "^3.0.0",
    "@google-cloud/storage": "^6.0.0"
  }
}

# Deploy
gcloud functions deploy splitAudio \
  --runtime nodejs18 \
  --trigger-http \
  --memory 1GB \
  --timeout 540s \
  --allow-unauthenticated
```

---

## 🎙️ Google Speech-to-Text (חלופה מלאה ל-ElevenLabs)

### למה זה מעניין:
- ✅ **תמלול + פיצול** במקום אחד
- ✅ **תמיכה מעולה בעברית**
- ✅ **זיהוי דוברים** (diarization)
- ✅ **עלות נמוכה** - $0.006/דקה
- ✅ **דיוק גבוה**

### דוגמת שימוש:
```javascript
const speech = require('@google-cloud/speech');

async function transcribeWithGoogle(audioBuffer) {
  const client = new speech.SpeechClient();
  
  const request = {
    audio: { content: audioBuffer.toString('base64') },
    config: {
      encoding: 'MP3',
      sampleRateHertz: 16000,
      languageCode: 'he-IL', // עברית
      enableAutomaticPunctuation: true,
      enableSpeakerDiarization: true,
      diarizationSpeakerCount: 2,
      model: 'latest_long', // למקטעים ארוכים
    },
  };

  const [response] = await client.recognize(request);
  
  return {
    text: response.results
      .map(result => result.alternatives[0].transcript)
      .join(' '),
    speakers: response.results.map(result => ({
      text: result.alternatives[0].transcript,
      speaker: result.alternatives[0].words?.[0]?.speakerTag
    }))
  };
}
```

---

## 🐳 Google Cloud Run (חלופה ל-Docker)

### יתרונות:
- ✅ **Pay-per-use** - משלם רק כשיש שימוש
- ✅ **מדרגיות אוטומטית** - 0 עד אלפי instances
- ✅ **Container מלא** - שליטה מלאה בסביבה
- ✅ **אין cold start** - מהיר יותר מ-Functions

### Dockerfile:
```dockerfile
FROM node:18-alpine

# Install FFmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 8080
CMD ["node", "server.js"]
```

### Deploy:
```bash
# Build and deploy
gcloud run deploy audio-splitter \
  --source . \
  --platform managed \
  --region us-central1 \
  --memory 2Gi \
  --cpu 2 \
  --timeout 3600 \
  --allow-unauthenticated
```

---

## 💰 השוואת עלויות Google vs AWS

### Google Cloud Functions:
- **Invocations:** $0.40/מיליון (AWS: $0.20/מיליון)
- **Compute:** $0.0000025/GB-second (AWS: $0.0000167/GB-second)
- **Network:** חינם עד 1GB (AWS: $0.09/GB)

### דוגמה לחישוב (100 קבצים/חודש):
```
Google Cloud Functions:
- 100 invocations: $0.00004
- Compute (1GB, 60s avg): $0.15
- Network: חינם
Total: ~$0.15/חודש

AWS Lambda:
- 100 invocations: $0.00002  
- Compute (1GB, 60s avg): $0.10
- Network: $0.90
Total: ~$1.00/חודש
```

**Google זול יותר לשימוש קל!**

---

## 🎯 Google Speech-to-Text vs ElevenLabs

| תכונה | Google Speech | ElevenLabs |
|--------|---------------|------------|
| **עלות** | $0.006/דקה | $0.30/דקה |
| **עברית** | מעולה | מעולה |
| **דיוק** | 95%+ | 98%+ |
| **מהירות** | מהיר | מהיר |
| **זיהוי דוברים** | ✅ | ❌ |
| **פיצוח** | אוטומטי | ידני |

---

## 🏆 ההמלצה שלי לGoogle Stack:

### **אפשרות 1: Google Cloud Functions + Speech-to-Text**
```
📱 App 
  ↓ 
🖥️ Next.js 
  ↓ 
☁️ Google Cloud Functions (פיצול)
  ↓ 
🎙️ Google Speech-to-Text (תמלול)
  ↓ 
📝 תוצאה מלאה
```

**יתרונות:**
- עלות נמוכה מאוד ($2-5/חודש)
- תמלול + פיצול במקום אחד
- זיהוי דוברים
- תמיכה מעולה בעברית

### **אפשרות 2: Google Cloud Run**
```
📱 App 
  ↓ 
🖥️ Next.js 
  ↓ 
🐳 Cloud Run Container (FFmpeg + Node.js)
  ↓ 
🎙️ ElevenLabs (או Google Speech)
```

**יתרונות:**
- גמישות מקסימלית
- ביצועים מעולים
- קל לפיתוח ובדיקה
- עלות סבירה ($5-15/חודש)

---

## 🤔 איזה Google פתרון הכי מתאים לך?

1. **רוצה הכי זול?** → Cloud Functions + Speech-to-Text
2. **רוצה הכי פשוט?** → Cloud Run עם FFmpeg
3. **רוצה הכי מהיר לפיתוח?** → Cloud Functions בלבד
4. **רוצה הכי גמיש?** → Cloud Run

איזה כיוון מעניין אותך? אני יכול להכין מימוש מלא! 🚀