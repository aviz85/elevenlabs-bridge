const functions = require('@google-cloud/functions-framework');
const { Storage } = require('@google-cloud/storage');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const https = require('https');
const http = require('http');

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

const storage = new Storage();
const BUCKET_NAME = process.env.STORAGE_BUCKET || 'elevenlabs-audio-segments';

console.log('🎵 Audio Splitter Service Starting...');
console.log('📦 FFmpeg path:', ffmpegPath);
console.log('🪣 Storage bucket:', BUCKET_NAME);

// Main audio splitting function
functions.http('splitAudio', async (req, res) => {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const startTime = Date.now();
  const taskId = uuidv4();
  
  console.log(`[${taskId}] 🚀 Starting audio processing`);

  try {
    const { audioUrl, segmentDurationMinutes = 15, returnFormat = 'mp3' } = req.body;

    if (!audioUrl) {
      return res.status(400).json({ error: 'audioUrl is required' });
    }

    console.log(`[${taskId}] 📥 Processing: ${audioUrl}`);
    console.log(`[${taskId}] ⏱️  Segment duration: ${segmentDurationMinutes} minutes`);

    // Download audio file to /tmp
    const inputFile = `/tmp/${taskId}_input${path.extname(audioUrl) || '.m4a'}`;
    await downloadFile(audioUrl, inputFile);

    const fileSize = fs.statSync(inputFile).size;
    console.log(`[${taskId}] ✅ File downloaded: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

    // Get audio duration
    const duration = await getAudioDuration(inputFile);
    console.log(`[${taskId}] ⏱️  Audio duration: ${Math.floor(duration / 60)}:${Math.floor(duration % 60).toString().padStart(2, '0')}`);

    // Calculate segments
    const segmentDurationSeconds = segmentDurationMinutes * 60;
    const numSegments = Math.ceil(duration / segmentDurationSeconds);

    console.log(`[${taskId}] 🔪 Will create ${numSegments} segments`);

    // Split audio into segments
    const segments = [];
    
    for (let i = 0; i < numSegments; i++) {
      const startTimeSeconds = i * segmentDurationSeconds;
      const endTimeSeconds = Math.min((i + 1) * segmentDurationSeconds, duration);
      const segmentDuration = endTimeSeconds - startTimeSeconds;

      const outputFile = `/tmp/${taskId}_segment_${i + 1}.${returnFormat}`;
      
      console.log(`[${taskId}] 🎵 Processing segment ${i + 1}/${numSegments} (${Math.floor(startTimeSeconds / 60)}:${Math.floor(startTimeSeconds % 60).toString().padStart(2, '0')} - ${Math.floor(endTimeSeconds / 60)}:${Math.floor(endTimeSeconds % 60).toString().padStart(2, '0')})`);
      
      // Split audio segment
      await splitAudioSegment(
        inputFile, 
        outputFile, 
        startTimeSeconds, 
        segmentDuration,
        returnFormat
      );

      const segmentSize = fs.statSync(outputFile).size;
      console.log(`[${taskId}] ✅ Segment ${i + 1} created: ${(segmentSize / 1024 / 1024).toFixed(2)} MB`);

      // Upload to Google Cloud Storage
      const fileName = `segments/${taskId}/segment_${i + 1}.${returnFormat}`;
      await storage.bucket(BUCKET_NAME).upload(outputFile, {
        destination: fileName,
        metadata: {
          contentType: `audio/${returnFormat}`,
          metadata: {
            taskId,
            segmentIndex: (i + 1).toString(),
            startTime: startTimeSeconds.toString(),
            endTime: endTimeSeconds.toString(),
            originalFilename: path.basename(audioUrl)
          }
        }
      });

      console.log(`[${taskId}] ☁️  Segment ${i + 1} uploaded to: ${fileName}`);

      // Generate public URL (bucket is public)
      const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${fileName}`;

      segments.push({
        index: i + 1,
        startTime: startTimeSeconds,
        endTime: endTimeSeconds,
        duration: segmentDuration,
        fileName,
        downloadUrl: publicUrl,
        size: segmentSize
      });

      // Clean up local segment file
      fs.unlinkSync(outputFile);
    }

    // Clean up input file
    fs.unlinkSync(inputFile);

    const processingTime = Date.now() - startTime;
    console.log(`[${taskId}] 🎉 Processing completed in ${(processingTime / 1000).toFixed(2)} seconds`);

    // Return results
    res.json({
      success: true,
      taskId,
      originalDuration: duration,
      originalSize: fileSize,
      segmentsCount: segments.length,
      segmentDurationMinutes,
      segments: segments.sort((a, b) => a.index - b.index),
      processingTimeMs: processingTime,
      bucketName: BUCKET_NAME,
      message: `Successfully split audio into ${segments.length} segments`
    });

  } catch (error) {
    console.error(`[${taskId}] ❌ Error:`, error);
    
    // Clean up any temp files
    try {
      const tempFiles = fs.readdirSync('/tmp').filter(f => f.includes(taskId));
      tempFiles.forEach(f => {
        try {
          fs.unlinkSync(`/tmp/${f}`);
          console.log(`[${taskId}] 🧹 Cleaned up: ${f}`);
        } catch (cleanupError) {
          console.warn(`[${taskId}] ⚠️  Cleanup warning:`, cleanupError.message);
        }
      });
    } catch (cleanupError) {
      console.warn(`[${taskId}] ⚠️  Cleanup error:`, cleanupError.message);
    }

    res.status(500).json({
      error: 'Audio processing failed',
      details: error.message,
      taskId
    });
  }
});

// Health check endpoint
functions.http('health', (req, res) => {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }

  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    ffmpegPath: ffmpegPath,
    bucketName: BUCKET_NAME,
    nodeVersion: process.version,
    platform: process.platform,
    method: req.method
  });
});

// Helper functions
async function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https:') ? https : http;
    const file = fs.createWriteStream(outputPath);
    
    console.log(`📥 Downloading: ${url}`);
    
    client.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`✅ Download completed: ${outputPath}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(outputPath, () => {}); // Delete the file on error
      reject(err);
    });
  });
}

function getAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.error('❌ FFprobe error:', err);
        reject(err);
      } else {
        const duration = metadata.format.duration;
        console.log(`⏱️  Duration detected: ${duration} seconds`);
        resolve(duration);
      }
    });
  });
}

function splitAudioSegment(inputPath, outputPath, startTime, duration, format) {
  return new Promise((resolve, reject) => {
    console.log(`🔪 Splitting: ${inputPath} -> ${outputPath} (${startTime}s, ${duration}s)`);
    
    ffmpeg(inputPath)
      .seekInput(startTime)
      .duration(duration)
      .audioCodec(format === 'mp3' ? 'libmp3lame' : 'aac')
      .audioBitrate('128k')
      .audioFrequency(44100)
      .audioChannels(2)
      .output(outputPath)
      .on('start', (commandLine) => {
        console.log(`🎬 FFmpeg command: ${commandLine}`);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          console.log(`📊 Progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        console.log(`✅ Segment completed: ${outputPath}`);
        resolve();
      })
      .on('error', (err) => {
        console.error(`❌ FFmpeg error: ${err.message}`);
        reject(err);
      })
      .run();
  });
}