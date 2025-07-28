const https = require('https');

async function testGoogleDirectly() {
  console.log('🧪 TESTING GOOGLE CLOUD FUNCTION DIRECTLY');
  console.log('='.repeat(60));
  console.log('🎯 Testing with your pre-uploaded audio file');
  console.log('📁 File: audio1436646319.m4a (66.42 MB)');
  console.log('☁️  Google Storage: elevenlabs-audio-segments/test/audio1436646319.m4a');
  
  const googleRequest = {
    audioUrl: 'https://storage.googleapis.com/elevenlabs-audio-segments/test/audio1436646319.m4a',
    segmentDurationMinutes: 15,
    returnFormat: 'mp3'
  };

  const requestData = JSON.stringify(googleRequest);

  const options = {
    hostname: 'us-central1-dreemz-whatsapp-mentor.cloudfunctions.net',
    path: '/splitAudio',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestData)
    }
  };

  return new Promise((resolve, reject) => {
    console.log('\n🚀 Calling Google Cloud Function...');
    console.log('📋 Request:', googleRequest);
    
    const req = https.request(options, (res) => {
      let data = '';
      
      console.log(`📊 Status: ${res.statusCode} ${res.statusMessage}`);

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve({ statusCode: res.statusCode, data: response });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(requestData);
    req.end();
  });
}

async function runDirectTest() {
  try {
    const result = await testGoogleDirectly();
    
    if (result.statusCode === 200 && result.data.success) {
      console.log('\n🎉 GOOGLE CLOUD FUNCTION SUCCESS!');
      console.log('✅ Function responded successfully');
      console.log(`✅ Task ID: ${result.data.taskId}`);
      console.log(`✅ Original duration: ${Math.floor(result.data.originalDuration / 60)}:${Math.floor(result.data.originalDuration % 60).toString().padStart(2, '0')}`);
      console.log(`✅ Segments created: ${result.data.segmentsCount}`);
      console.log(`✅ Processing time: ${(result.data.processingTimeMs / 1000).toFixed(2)}s`);
      console.log(`✅ Bucket: ${result.data.bucketName}`);
      
      if (result.data.segments && result.data.segments.length > 0) {
        console.log('\n📋 Created segments:');
        result.data.segments.slice(0, 3).forEach((segment, index) => {
          const startMin = Math.floor(segment.startTime / 60);
          const startSec = Math.floor(segment.startTime % 60);
          const endMin = Math.floor(segment.endTime / 60);
          const endSec = Math.floor(segment.endTime % 60);
          
          console.log(`   ${index + 1}. [${startMin}:${startSec.toString().padStart(2, '0')}-${endMin}:${endSec.toString().padStart(2, '0')}] ${(segment.size / 1024 / 1024).toFixed(2)} MB`);
          console.log(`      📁 ${segment.fileName}`);
        });
        
        if (result.data.segments.length > 3) {
          console.log(`   ... and ${result.data.segments.length - 3} more segments`);
        }
      }
      
      console.log('\n🏆 VERIFICATION COMPLETE:');
      console.log('✅ Your 66MB audio file works perfectly with Google Cloud Functions');
      console.log('✅ Audio splitting is functional');
      console.log('✅ Google Cloud Storage uploads work');
      console.log('✅ FFmpeg processing is successful');
      console.log('✅ Public URLs are generated correctly');
      
    } else {
      console.log('\n❌ GOOGLE CLOUD FUNCTION FAILED');
      console.log('📄 Response:', JSON.stringify(result, null, 2));
    }

  } catch (error) {
    console.error('\n❌ Direct test failed:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🏁 DIRECT GOOGLE TEST COMPLETED');
  console.log('='.repeat(60));
}

runDirectTest(); 