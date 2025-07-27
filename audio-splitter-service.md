# שירות פיצול אודיו חיצוני

## 🎯 הפתרון המומלץ: AWS Lambda עם FFmpeg Layer

### למה AWS Lambda?
- ✅ FFmpeg זמין כ-Layer
- ✅ עיבוד מהיר ויעיל
- ✅ תמחור לפי שימוש
- ✅ מדרגיות אוטומטית
- ✅ אמינות גבוהה

### ארכיטקטורה:
```
📱 Client App
    ↓ (upload file)
🖥️ Next.js API
    ↓ (send to AWS)
☁️ AWS Lambda + FFmpeg
    ↓ (split & return URLs)
💾 S3 Storage
    ↓ (download segments)
🎙️ ElevenLabs API
```

## 🛠️ מימוש AWS Lambda

### 1. Lambda Function (Node.js)
```javascript
const AWS = require('aws-sdk');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
    const { audioUrl, segmentDuration = 900 } = JSON.parse(event.body);
    
    try {
        // Download audio file
        const inputFile = '/tmp/input.m4a';
        await downloadFile(audioUrl, inputFile);
        
        // Get duration
        const duration = getDuration(inputFile);
        
        // Split audio
        const segments = await splitAudio(inputFile, segmentDuration);
        
        // Upload segments to S3
        const segmentUrls = await uploadSegments(segments);
        
        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                totalDuration: duration,
                segmentsCount: segments.length,
                segmentUrls
            })
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message })
        };
    }
};

function getDuration(filePath) {
    const output = execSync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`);
    return parseFloat(output.toString().trim());
}

async function splitAudio(inputFile, segmentDuration) {
    const duration = getDuration(inputFile);
    const numSegments = Math.ceil(duration / segmentDuration);
    const segments = [];
    
    for (let i = 0; i < numSegments; i++) {
        const startTime = i * segmentDuration;
        const outputFile = `/tmp/segment_${i + 1}.mp3`;
        
        execSync(`ffmpeg -i "${inputFile}" -ss ${startTime} -t ${segmentDuration} -acodec mp3 -y "${outputFile}"`);
        
        segments.push({
            index: i + 1,
            filePath: outputFile,
            startTime,
            endTime: Math.min((i + 1) * segmentDuration, duration)
        });
    }
    
    return segments;
}
```

### 2. Deployment (Serverless Framework)
```yaml
# serverless.yml
service: audio-splitter

provider:
  name: aws
  runtime: nodejs18.x
  region: us-east-1

functions:
  splitAudio:
    handler: handler.splitAudio
    timeout: 300
    memorySize: 1024
    layers:
      - arn:aws:lambda:us-east-1:123456789012:layer:ffmpeg:1

resources:
  Resources:
    AudioBucket:
      Type: AWS::S3::Bucket
      Properties:
        BucketName: audio-splitter-segments
```

## 🚀 אפשרות 2: Docker Container על Cloud Run

### Dockerfile
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

### Server.js
```javascript
const express = require('express');
const multer = require('multer');
const { execSync } = require('child_process');
const fs = require('fs');

const app = express();
const upload = multer({ dest: '/tmp/' });

app.post('/split-audio', upload.single('audio'), async (req, res) => {
    try {
        const { segmentDuration = 900 } = req.body;
        const inputFile = req.file.path;
        
        // Get duration
        const duration = getDuration(inputFile);
        
        // Split audio
        const segments = await splitAudio(inputFile, segmentDuration);
        
        res.json({
            success: true,
            totalDuration: duration,
            segments
        });
        
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(8080, () => {
    console.log('Audio splitter service running on port 8080');
});
```

## 💡 אפשרות 3: פיצול בצד הלקוח (JavaScript)

### Web Audio API + ArrayBuffer
```javascript
class AudioSplitter {
    async splitAudio(audioFile, segmentDuration = 900) {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const arrayBuffer = await audioFile.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        const sampleRate = audioBuffer.sampleRate;
        const segmentSamples = segmentDuration * sampleRate;
        const totalSamples = audioBuffer.length;
        const numSegments = Math.ceil(totalSamples / segmentSamples);
        
        const segments = [];
        
        for (let i = 0; i < numSegments; i++) {
            const startSample = i * segmentSamples;
            const endSample = Math.min((i + 1) * segmentSamples, totalSamples);
            const segmentLength = endSample - startSample;
            
            // Create new AudioBuffer for segment
            const segmentBuffer = audioContext.createBuffer(
                audioBuffer.numberOfChannels,
                segmentLength,
                sampleRate
            );
            
            // Copy audio data
            for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
                const channelData = audioBuffer.getChannelData(channel);
                const segmentChannelData = segmentBuffer.getChannelData(channel);
                
                for (let sample = 0; sample < segmentLength; sample++) {
                    segmentChannelData[sample] = channelData[startSample + sample];
                }
            }
            
            // Convert to WAV blob
            const wavBlob = this.audioBufferToWav(segmentBuffer);
            
            segments.push({
                index: i + 1,
                blob: wavBlob,
                startTime: startSample / sampleRate,
                endTime: endSample / sampleRate,
                duration: segmentLength / sampleRate
            });
        }
        
        return segments;
    }
    
    audioBufferToWav(buffer) {
        // Implementation to convert AudioBuffer to WAV
        // ... (complex but doable)
    }
}
```

## 🎯 המלצה סופית

**לפרודקשן אמיתי - AWS Lambda עם FFmpeg Layer:**

1. **יתרונות:**
   - עיבוד מהיר ואמין
   - תמחור לפי שימוש
   - מדרגיות אוטומטית
   - תאימות מלאה

2. **עלות:**
   - ~$0.20 לכל 1000 בקשות
   - זול מאוד לשימוש רגיל

3. **מימוש:**
   - פיתוח של יום אחד
   - פריסה פשוטה
   - תחזוקה מינימלית

האם תרצה שאני אכין לך מימוש מלא של AWS Lambda לפיצול אודיו?