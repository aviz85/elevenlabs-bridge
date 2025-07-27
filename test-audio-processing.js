#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { default: fetch } = require('node-fetch');
const FormData = require('form-data');

async function testAudioProcessing() {
  console.log('🧪 Testing audio processing with test_input file...\n');

  const audioFilePath = path.join(__dirname, 'test_input', 'audio1436646319.m4a');
  
  if (!fs.existsSync(audioFilePath)) {
    console.error('❌ Audio file not found:', audioFilePath);
    return;
  }

  console.log('📁 Found audio file:', audioFilePath);
  const stats = fs.statSync(audioFilePath);
  console.log('📊 File size:', (stats.size / 1024 / 1024).toFixed(2), 'MB');

  // Test direct ElevenLabs API call with the audio file
  console.log('\n🎯 Testing direct ElevenLabs transcription...');
  
  try {
    const apiKey = 'sk_63273dc2fb5b982fa618983c924954749908381a638d1566';
    
    // Create form data for ElevenLabs API
    const formData = new FormData();
    formData.append('file', fs.createReadStream(audioFilePath));
    formData.append('model_id', 'eleven_multilingual_v2'); // Use available model
    
    console.log('   📤 Sending audio to ElevenLabs...');
    
    const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (response.ok) {
      const result = await response.json();
      console.log('   ✅ Transcription successful!');
      console.log('   📝 Result:');
      console.log('   ─'.repeat(50));
      console.log(result.text || 'No transcription text returned');
      console.log('   ─'.repeat(50));
    } else {
      const errorText = await response.text();
      console.error('   ❌ Transcription failed:', response.status, response.statusText);
      console.error('   📄 Error details:', errorText);
      
      if (response.status === 422) {
        console.log('\n   💡 This might be because:');
        console.log('   1. The file format is not supported by ElevenLabs');
        console.log('   2. The file is too large');
        console.log('   3. The audio quality is too poor');
        console.log('   4. Your subscription doesn\'t include speech-to-text');
      }
    }

  } catch (error) {
    console.error('❌ Error during transcription:', error.message);
  }

  // Test file conversion (if needed)
  console.log('\n🔄 Testing file info...');
  try {
    // Use ffprobe to get file info (if available)
    const { execSync } = require('child_process');
    try {
      const ffprobeOutput = execSync(`ffprobe -v quiet -print_format json -show_format -show_streams "${audioFilePath}"`, { encoding: 'utf8' });
      const fileInfo = JSON.parse(ffprobeOutput);
      console.log('   📊 Audio format info:');
      console.log(`      - Format: ${fileInfo.format.format_name}`);
      console.log(`      - Duration: ${parseFloat(fileInfo.format.duration).toFixed(2)} seconds`);
      console.log(`      - Size: ${(parseInt(fileInfo.format.size) / 1024 / 1024).toFixed(2)} MB`);
      
      if (fileInfo.streams && fileInfo.streams[0]) {
        const audioStream = fileInfo.streams[0];
        console.log(`      - Codec: ${audioStream.codec_name}`);
        console.log(`      - Sample Rate: ${audioStream.sample_rate} Hz`);
        console.log(`      - Channels: ${audioStream.channels}`);
      }
    } catch (ffprobeError) {
      console.log('   ⚠️  ffprobe not available, skipping detailed file analysis');
    }
  } catch (error) {
    console.log('   ⚠️  Could not analyze file:', error.message);
  }
}

testAudioProcessing();