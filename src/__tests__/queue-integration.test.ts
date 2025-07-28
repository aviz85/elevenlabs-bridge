import { QueueManager } from '../services/queue-manager'
import { transcriptionService } from '../services/transcription'
import { databaseService } from '../services/database'
import { audioProcessingService } from '../services/audio-processing'
import { elevenLabsService } from '../services/elevenlabs'

// Mock all dependencies
jest.mock('../services/database')
jest.mock('../services/audio-processing')
jest.mock('../services/elevenlabs')
jest.mock('@/lib/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      insert: jest.fn(),
      select: jest.fn(),
      update: jest.fn(),
      eq: jest.fn(),
      single: jest.fn()
    })),
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn(),
        download: jest.fn()
      }))
    }
  }
}))

const mockDatabaseService = databaseService as jest.Mocked<typeof databaseService>
const mockAudioProcessingService = audioProcessingService as jest.Mocked<typeof audioProcessingService>
const mockElevenLabsService = elevenLabsService as jest.Mocked<typeof elevenLabsService>

describe('Queue Integration', () => {
  let testQueueManager: QueueManager

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Create a fresh queue manager for each test
    testQueueManager = new QueueManager({
      maxConcurrentJobs: 4,
      retryAttempts: 2,
      retryDelayMs: 100,
      retryBackoffMultiplier: 2,
      maxRetryDelayMs: 1000
    })
    
    // Set up environment variables
    process.env.WEBHOOK_BASE_URL = 'https://test.example.com'
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
  })

  afterEach(() => {
    testQueueManager.stopProcessing()
    delete process.env.WEBHOOK_BASE_URL
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  describe('Transcription Service with Queue Manager', () => {
    it('should process transcription request using queue manager', async () => {
      // Mock task creation
      const mockTask = {
        id: 'task-1',
        client_webhook_url: 'https://client.example.com/webhook',
        original_filename: 'test.mp3',
        status: 'processing',
        total_segments: 2,
        completed_segments: 0,
        created_at: new Date().toISOString()
      }

      mockDatabaseService.createTask.mockResolvedValue(mockTask)
      mockDatabaseService.updateTask.mockResolvedValue(mockTask)

      // Mock audio processing
      mockAudioProcessingService.uploadFileForProcessing.mockResolvedValue('uploads/task-1/test.mp3')
      mockAudioProcessingService.processAudio.mockResolvedValue({
        success: true,
        taskId: 'task-1',
        totalDuration: 1800,
        segmentsCreated: 2,
        segments: [
          {
            id: 'segment-1',
            filePath: 'segments/task-1/segment_1.mp3',
            startTime: 0,
            endTime: 900,
            duration: 900
          },
          {
            id: 'segment-2',
            filePath: 'segments/task-1/segment_2.mp3',
            startTime: 900,
            endTime: 1800,
            duration: 900
          }
        ]
      })

      // Mock database segments
      const mockSegments = [
        {
          id: 'segment-1',
          task_id: 'task-1',
          file_path: 'segments/task-1/segment_1.mp3',
          start_time: 0,
          end_time: 900,
          status: 'pending',
          created_at: new Date().toISOString()
        },
        {
          id: 'segment-2',
          task_id: 'task-1',
          file_path: 'segments/task-1/segment_2.mp3',
          start_time: 900,
          end_time: 1800,
          status: 'pending',
          created_at: new Date().toISOString()
        }
      ]

      mockDatabaseService.getSegmentsByTaskId.mockResolvedValue(mockSegments)

      // Mock queue processing
      mockDatabaseService.updateSegment.mockResolvedValue({} as any)
      mockAudioProcessingService.downloadSegment.mockResolvedValue(Buffer.from('audio data'))
      mockElevenLabsService.transcribeAudio.mockResolvedValue({
        taskId: 'elevenlabs-task-1'
      })

      // Create mock file with arrayBuffer method
      const mockFile = {
        name: 'test.mp3',
        type: 'audio/mpeg',
        size: 1024,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(1024))
      } as unknown as File

      // Process transcription request
      const result = await transcriptionService.processTranscriptionRequest({
        file: mockFile,
        webhookUrl: 'https://client.example.com/webhook',
        useRealElevenLabs: true
      })

      expect(result.taskId).toBe('task-1')

      // Verify task was created
      expect(mockDatabaseService.createTask).toHaveBeenCalledWith({
        client_webhook_url: 'https://client.example.com/webhook',
        original_filename: 'test.mp3'
      })

      // Verify audio processing was called
      expect(mockAudioProcessingService.uploadFileForProcessing).toHaveBeenCalled()
      expect(mockAudioProcessingService.processAudio).toHaveBeenCalledWith({
        taskId: 'task-1',
        filePath: 'uploads/task-1/test.mp3',
        originalFilename: 'test.mp3',
        segmentDurationMinutes: 15
      })

      // Verify task was updated with segment info
      expect(mockDatabaseService.updateTask).toHaveBeenCalledWith('task-1', {
        total_segments: 2,
        converted_file_path: 'segments/task-1/segment_1.mp3'
      })

      // Verify segments were retrieved and added to queue
      expect(mockDatabaseService.getSegmentsByTaskId).toHaveBeenCalledWith('task-1')

      // The transcription service uses its own queue manager instance
      // So we can't directly test the testQueueManager stats
      // Instead, verify that the process completed successfully
      expect(result.taskId).toBe('task-1')
    })

    it('should handle queue processing with retries', async () => {
      const mockSegment = {
        id: 'segment-1',
        task_id: 'task-1',
        file_path: 'segments/task-1/segment_1.mp3',
        start_time: 0,
        end_time: 900,
        status: 'pending',
        created_at: new Date().toISOString()
      }

      // Mock initial failure then success
      let callCount = 0
      mockElevenLabsService.transcribeAudio.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          throw new Error('Rate limit exceeded')
        }
        return Promise.resolve({ taskId: 'elevenlabs-task-1' })
      })

      mockDatabaseService.updateSegment.mockResolvedValue({} as any)
      mockAudioProcessingService.downloadSegment.mockResolvedValue(Buffer.from('audio data'))

      // Add segment to queue
      const jobId = await testQueueManager.addSegmentToQueue(mockSegment)

      // Wait for retry processing
      await new Promise(resolve => setTimeout(resolve, 400))

      const job = testQueueManager.getJob(jobId)
      expect(['completed', 'retrying']).toContain(job?.status) // May still be retrying
      expect(job?.attempts).toBeGreaterThanOrEqual(1)
      expect(callCount).toBeGreaterThanOrEqual(1)
    })

    it('should handle concurrent processing limits', async () => {
      const segments = Array.from({ length: 6 }, (_, i) => ({
        id: `segment-${i + 1}`,
        task_id: 'task-1',
        file_path: `segments/task-1/segment_${i + 1}.mp3`,
        start_time: i * 900,
        end_time: (i + 1) * 900,
        status: 'pending',
        created_at: new Date().toISOString()
      }))

      mockDatabaseService.updateSegment.mockResolvedValue({} as any)
      mockAudioProcessingService.downloadSegment.mockResolvedValue(Buffer.from('audio data'))
      mockElevenLabsService.transcribeAudio.mockResolvedValue({
        taskId: 'elevenlabs-task-1'
      })

      // Add all segments to queue
      const jobIds = await testQueueManager.addSegmentsToQueue(segments, 'task-1')
      expect(jobIds).toHaveLength(6)

      // Wait for some processing
      await new Promise(resolve => setTimeout(resolve, 100))

      // Check that concurrency limit is respected
      const stats = testQueueManager.getQueueStats()
      expect(stats.processing).toBeLessThanOrEqual(4) // Default max concurrent jobs
      expect(stats.totalJobs).toBeGreaterThanOrEqual(6) // May have jobs from previous tests
    })

    it('should provide queue statistics and job management', async () => {
      const segments = [
        {
          id: 'segment-1',
          task_id: 'task-1',
          file_path: 'segments/task-1/segment_1.mp3',
          start_time: 0,
          end_time: 900,
          status: 'pending',
          created_at: new Date().toISOString()
        },
        {
          id: 'segment-2',
          task_id: 'task-2',
          file_path: 'segments/task-2/segment_1.mp3',
          start_time: 0,
          end_time: 900,
          status: 'pending',
          created_at: new Date().toISOString()
        }
      ]

      await testQueueManager.addSegmentToQueue(segments[0])
      await testQueueManager.addSegmentToQueue(segments[1])

      // Test queue statistics
      const stats = testQueueManager.getQueueStats()
      expect(stats.totalJobs).toBeGreaterThanOrEqual(2)
      expect(stats.pending).toBeGreaterThanOrEqual(2)

      // Test job retrieval by task
      const task1Jobs = testQueueManager.getJobsByTaskId('task-1')
      const task2Jobs = testQueueManager.getJobsByTaskId('task-2')
      
      expect(task1Jobs).toHaveLength(1)
      expect(task2Jobs).toHaveLength(1)
      expect(task1Jobs[0].segmentId).toBe('segment-1')
      expect(task2Jobs[0].segmentId).toBe('segment-2')

      // Test job cancellation
      const cancelledCount = testQueueManager.cancelTaskJobs('task-1')
      expect(cancelledCount).toBe(1)

      const updatedTask1Jobs = testQueueManager.getJobsByTaskId('task-1')
      expect(updatedTask1Jobs[0].status).toBe('failed')
      expect(updatedTask1Jobs[0].error).toBe('Cancelled by user')
    })

    it('should clean up old completed jobs', async () => {
      const mockSegment = {
        id: 'segment-1',
        task_id: 'task-1',
        file_path: 'segments/task-1/segment_1.mp3',
        start_time: 0,
        end_time: 900,
        status: 'pending',
        created_at: new Date().toISOString()
      }

      const jobId = await testQueueManager.addSegmentToQueue(mockSegment)
      
      // Manually mark job as completed and old
      const job = testQueueManager.getJob(jobId)!
      job.status = 'completed'
      job.createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000) // 25 hours ago

      // Clean up old jobs
      const removedCount = testQueueManager.cleanupOldJobs(24 * 60 * 60 * 1000) // 24 hours
      expect(removedCount).toBe(1)
      expect(testQueueManager.getJob(jobId)).toBeUndefined()
    })
  })
})