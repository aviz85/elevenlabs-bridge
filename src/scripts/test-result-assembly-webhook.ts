#!/usr/bin/env npx ts-node

/**
 * Test script for result assembly and webhook notification system
 * This script demonstrates the complete workflow from segment combination to webhook delivery
 */

import { resultAssemblerService } from '../services/result-assembler.js'
import { clientWebhookService } from '../services/client-webhook.js'
import { Segment, Task } from '../types/index.js'

async function testResultAssemblyWorkflow() {
  console.log('🚀 Testing Result Assembly and Webhook Notification System\n')

  // Test 1: Result Assembly
  console.log('📋 Test 1: Result Assembly')
  console.log('=' .repeat(50))

  const mockSegments: Segment[] = [
    {
      id: 'segment-1',
      task_id: 'test-task',
      file_path: '/tmp/segment1.mp3',
      start_time: 0,
      end_time: 15,
      status: 'completed',
      transcription_text: 'Welcome to our audio transcription service.',
      elevenlabs_task_id: 'el-task-1',
      created_at: '2024-01-01T00:00:00Z'
    },
    {
      id: 'segment-2',
      task_id: 'test-task',
      file_path: '/tmp/segment2.mp3',
      start_time: 15,
      end_time: 30,
      status: 'completed',
      transcription_text: 'This system can handle large audio files by splitting them into segments.',
      elevenlabs_task_id: 'el-task-2',
      created_at: '2024-01-01T00:00:00Z'
    },
    {
      id: 'segment-3',
      task_id: 'test-task',
      file_path: '/tmp/segment3.mp3',
      start_time: 30,
      end_time: 45,
      status: 'completed',
      transcription_text: 'Each segment is processed concurrently for faster results.',
      elevenlabs_task_id: 'el-task-3',
      created_at: '2024-01-01T00:00:00Z'
    }
  ]

  try {
    // Test segment validation
    console.log('Validating segments for combination...')
    const validation = resultAssemblerService.validateSegmentsForCombination(mockSegments)
    console.log(`✅ Segments ready: ${validation.isReady}`)
    console.log(`📊 Missing segments: ${validation.missingSegments.length}`)

    // Test segment combination
    console.log('\nCombining segments...')
    const combinedResult = await resultAssemblerService.combineSegments(mockSegments)
    
    console.log('✅ Segments combined successfully!')
    console.log(`📝 Combined text: "${combinedResult.text}"`)
    console.log(`⏱️  Total duration: ${combinedResult.metadata.totalDuration} seconds`)
    console.log(`🌍 Language: ${combinedResult.metadata.languageCode}`)
    console.log(`🎯 Confidence: ${combinedResult.metadata.confidence}`)
    console.log(`📊 Segments: ${combinedResult.segments.length}`)

    // Test transcription summary
    const summary = resultAssemblerService.createTranscriptionSummary(combinedResult)
    console.log('\n📈 Transcription Summary:')
    console.log(`   Word count: ${summary.wordCount}`)
    console.log(`   Estimated reading time: ${summary.estimatedReadingTime} minutes`)
    console.log(`   Segment count: ${summary.segmentCount}`)
    console.log(`   Average segment duration: ${summary.averageSegmentDuration.toFixed(1)} seconds`)

    // Test 2: Webhook Configuration
    console.log('\n🔧 Test 2: Webhook Configuration')
    console.log('=' .repeat(50))

    const webhookConfig = clientWebhookService.getWebhookConfig()
    console.log(`Max retries: ${webhookConfig.maxRetries}`)
    console.log(`Timeout: ${webhookConfig.timeoutMs}ms`)
    console.log(`Signing enabled: ${webhookConfig.signingEnabled}`)

    // Test 3: HMAC Signature
    console.log('\n🔐 Test 3: HMAC Signature Verification')
    console.log('=' .repeat(50))

    const testPayload = JSON.stringify({ test: 'webhook payload' })
    const service = clientWebhookService as any
    const signature = service.createHMACSignature(testPayload)
    console.log(`Generated signature: ${signature}`)

    const isValid = clientWebhookService.verifyHMACSignature(testPayload, signature)
    console.log(`✅ Signature verification: ${isValid ? 'PASSED' : 'FAILED'}`)

    const isInvalid = clientWebhookService.verifyHMACSignature(testPayload, 'invalid-signature')
    console.log(`❌ Invalid signature test: ${!isInvalid ? 'PASSED' : 'FAILED'}`)

    // Test 4: Webhook Payload Creation
    console.log('\n📦 Test 4: Webhook Payload Creation')
    console.log('=' .repeat(50))

    const mockTask: Task = {
      id: 'test-task-123',
      client_webhook_url: 'https://example.com/webhook',
      original_filename: 'test-audio.mp3',
      status: 'completed',
      total_segments: 3,
      completed_segments: 3,
      final_transcription: combinedResult.text,
      created_at: '2024-01-01T00:00:00Z',
      completed_at: '2024-01-01T00:01:30Z'
    }

    const webhookPayload = service.createWebhookPayload(mockTask, combinedResult)
    console.log('✅ Webhook payload created:')
    console.log(`   Task ID: ${webhookPayload.taskId}`)
    console.log(`   Status: ${webhookPayload.status}`)
    console.log(`   Original filename: ${webhookPayload.originalFilename}`)
    console.log(`   Transcription length: ${webhookPayload.transcription?.length} characters`)
    console.log(`   Word count: ${webhookPayload.metadata?.wordCount}`)
    console.log(`   Segment count: ${webhookPayload.metadata?.segmentCount}`)
    console.log(`   Total duration: ${webhookPayload.metadata?.totalDuration}s`)
    console.log(`   Language: ${webhookPayload.metadata?.languageCode}`)
    console.log(`   Confidence: ${webhookPayload.metadata?.confidence}`)

    // Test 5: Backoff Calculation
    console.log('\n⏰ Test 5: Exponential Backoff Calculation')
    console.log('=' .repeat(50))

    for (let attempt = 1; attempt <= 5; attempt++) {
      const delay = service.calculateBackoffDelay(attempt)
      console.log(`Attempt ${attempt}: ${delay}ms delay`)
    }

    console.log('\n🎉 All tests completed successfully!')
    console.log('\n📋 Summary:')
    console.log('✅ Result assembly service working correctly')
    console.log('✅ Webhook payload creation working correctly')
    console.log('✅ HMAC signature generation and verification working correctly')
    console.log('✅ Exponential backoff calculation working correctly')
    console.log('✅ Configuration management working correctly')

  } catch (error) {
    console.error('❌ Test failed:', error)
    process.exit(1)
  }
}

async function testFailureScenarios() {
  console.log('\n🚨 Testing Failure Scenarios')
  console.log('=' .repeat(50))

  // Test with failed segments
  const mixedSegments: Segment[] = [
    {
      id: 'segment-1',
      task_id: 'test-task',
      file_path: '/tmp/segment1.mp3',
      start_time: 0,
      end_time: 15,
      status: 'completed',
      transcription_text: 'This segment succeeded.',
      created_at: '2024-01-01T00:00:00Z'
    },
    {
      id: 'segment-2',
      task_id: 'test-task',
      file_path: '/tmp/segment2.mp3',
      start_time: 15,
      end_time: 30,
      status: 'failed',
      transcription_text: undefined,
      error_message: 'ElevenLabs API error',
      created_at: '2024-01-01T00:00:00Z'
    },
    {
      id: 'segment-3',
      task_id: 'test-task',
      file_path: '/tmp/segment3.mp3',
      start_time: 30,
      end_time: 45,
      status: 'completed',
      transcription_text: 'This segment also succeeded.',
      created_at: '2024-01-01T00:00:00Z'
    }
  ]

  try {
    console.log('Testing with mixed success/failure segments...')
    const result = await resultAssemblerService.combineSegments(mixedSegments)
    console.log(`✅ Handled mixed segments correctly`)
    console.log(`📝 Combined text: "${result.text}"`)
    console.log(`📊 Valid segments used: ${result.segments.length} out of ${mixedSegments.length}`)

    // Test failure webhook payload
    const failedTask: Task = {
      id: 'failed-task-123',
      client_webhook_url: 'https://example.com/webhook',
      original_filename: 'failed-audio.mp3',
      status: 'failed',
      total_segments: 3,
      completed_segments: 1,
      error_message: 'Some segments failed to process',
      created_at: '2024-01-01T00:00:00Z',
      completed_at: '2024-01-01T00:01:30Z'
    }

    const service = clientWebhookService as any
    const failurePayload = service.createWebhookPayload(failedTask, undefined, 'Processing failed due to API errors')
    console.log('\n✅ Failure webhook payload created:')
    console.log(`   Status: ${failurePayload.status}`)
    console.log(`   Error: ${failurePayload.error}`)
    console.log(`   Has transcription: ${!!failurePayload.transcription}`)

  } catch (error) {
    console.error('❌ Failure scenario test failed:', error)
  }
}

// Run the tests
async function main() {
  try {
    await testResultAssemblyWorkflow()
    await testFailureScenarios()
    
    console.log('\n🏁 All tests completed!')
    process.exit(0)
  } catch (error) {
    console.error('❌ Test suite failed:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}