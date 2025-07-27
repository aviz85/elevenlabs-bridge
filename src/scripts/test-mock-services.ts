/**
 * Test script to verify mock services are working
 * Run with: npx ts-node src/scripts/test-mock-services.ts
 */

import { mockAudioService } from '../services/mock-audio'
import { mockElevenLabsService } from '../services/mock-elevenlabs'
import { databaseService } from '../services/database'

async function testMockServices() {
  console.log('🧪 Testing Mock Services...\n')

  try {
    // Test 1: Mock Audio Service
    console.log('1. Testing Mock Audio Service:')
    const mockFile = {
      name: 'test-audio.mp3',
      size: 5 * 1024 * 1024, // 5MB
      type: 'audio/mp3'
    } as File

    const duration = await mockAudioService.getAudioDuration(mockFile)
    console.log(`   ✅ Audio duration: ${duration} seconds`)

    const { convertedPath } = await mockAudioService.convertToMp3(mockFile)
    console.log(`   ✅ Converted to: ${convertedPath}`)

    const segments = await mockAudioService.createSegments(convertedPath, duration)
    console.log(`   ✅ Created ${segments.length} segments`)

    // Test 2: Mock ElevenLabs Service
    console.log('\n2. Testing Mock ElevenLabs Service:')
    const { taskId } = await mockElevenLabsService.transcribeAudio(
      segments[0].filePath,
      { modelId: 'scribe_v1', webhook: true }
    )
    console.log(`   ✅ ElevenLabs task started: ${taskId}`)

    const isValidKey = await mockElevenLabsService.validateApiKey('test-api-key-12345')
    console.log(`   ✅ API key validation: ${isValidKey}`)

    // Test 3: Database Service
    console.log('\n3. Testing Database Service:')
    const task = await databaseService.createTask({
      client_webhook_url: 'https://example.com/webhook',
      original_filename: 'test-audio.mp3',
      total_segments: segments.length
    })
    console.log(`   ✅ Task created: ${task.id}`)

    const retrievedTask = await databaseService.getTask(task.id)
    console.log(`   ✅ Task retrieved: ${retrievedTask?.status}`)

    // Create a test segment
    const segment = await databaseService.createSegment({
      task_id: task.id,
      file_path: segments[0].filePath,
      start_time: segments[0].startTime,
      end_time: segments[0].endTime
    })
    console.log(`   ✅ Segment created: ${segment.id}`)

    const taskSegments = await databaseService.getSegmentsByTaskId(task.id)
    console.log(`   ✅ Retrieved ${taskSegments.length} segments for task`)

    console.log('\n🎉 All mock services are working correctly!')

  } catch (error) {
    console.error('❌ Error testing mock services:', error)
    process.exit(1)
  }
}

// Run the test
testMockServices()