import { QueueManager, QueueConfig, QueueJob } from '../queue-manager'
import { databaseService } from '../database'
import { elevenLabsService } from '../elevenlabs'
import { audioProcessingService } from '../audio-processing'
import { Segment } from '@/types'
import { ExternalServiceError } from '@/lib/errors'

// Mock Supabase client to avoid ES module issues
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

// Mock dependencies
jest.mock('../database')
jest.mock('../elevenlabs')
jest.mock('../audio-processing')

const mockDatabaseService = databaseService as jest.Mocked<typeof databaseService>
const mockElevenLabsService = elevenLabsService as jest.Mocked<typeof elevenLabsService>
const mockAudioProcessingService = audioProcessingService as jest.Mocked<typeof audioProcessingService>

describe('QueueManager', () => {
  let queueManager: QueueManager
  const mockSegment: Segment = {
    id: 'segment-1',
    task_id: 'task-1',
    file_path: 'segments/task-1/segment_1.mp3',
    start_time: 0,
    end_time: 900,
    status: 'pending',
    created_at: new Date().toISOString()
  }

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Create a new queue manager with fast processing for tests
    queueManager = new QueueManager({
      maxConcurrentJobs: 2,
      retryAttempts: 2,
      retryDelayMs: 100,
      retryBackoffMultiplier: 2,
      maxRetryDelayMs: 1000
    })

    // Set up environment variable
    process.env.WEBHOOK_BASE_URL = 'https://test.example.com'
  })

  afterEach(() => {
    queueManager.stopProcessing()
    delete process.env.WEBHOOK_BASE_URL
  })

  describe('Configuration', () => {
    it('should initialize with default configuration', () => {
      const defaultQueue = new QueueManager()
      const config = defaultQueue.getConfig()
      
      expect(config.maxConcurrentJobs).toBe(4)
      expect(config.retryAttempts).toBe(3)
      expect(config.retryDelayMs).toBe(1000)
      expect(config.retryBackoffMultiplier).toBe(2)
      expect(config.maxRetryDelayMs).toBe(30000)
    })

    it('should accept custom configuration', () => {
      const customConfig: Partial<QueueConfig> = {
        maxConcurrentJobs: 8,
        retryAttempts: 5
      }
      
      const customQueue = new QueueManager(customConfig)
      const config = customQueue.getConfig()
      
      expect(config.maxConcurrentJobs).toBe(8)
      expect(config.retryAttempts).toBe(5)
      expect(config.retryDelayMs).toBe(1000) // Default value
    })

    it('should update configuration', () => {
      const newConfig = { maxConcurrentJobs: 6 }
      queueManager.updateConfig(newConfig)
      
      const config = queueManager.getConfig()
      expect(config.maxConcurrentJobs).toBe(6)
    })
  })

  describe('Job Management', () => {
    it('should add segment to queue', async () => {
      const jobId = await queueManager.addSegmentToQueue(mockSegment, 1)
      
      expect(jobId).toMatch(/^job_segment-1_\d+$/)
      
      const job = queueManager.getJob(jobId)
      expect(job).toBeDefined()
      expect(job?.segmentId).toBe('segment-1')
      expect(job?.taskId).toBe('task-1')
      expect(job?.priority).toBe(1)
      expect(job?.status).toBe('pending')
    })

    it('should add multiple segments to queue with priority', async () => {
      const segments: Segment[] = [
        { ...mockSegment, id: 'segment-1' },
        { ...mockSegment, id: 'segment-2' },
        { ...mockSegment, id: 'segment-3' }
      ]

      const jobIds = await queueManager.addSegmentsToQueue(segments, 'task-1')
      
      expect(jobIds).toHaveLength(3)
      
      // Check priorities (earlier segments should have higher priority)
      const job1 = queueManager.getJob(jobIds[0])
      const job2 = queueManager.getJob(jobIds[1])
      const job3 = queueManager.getJob(jobIds[2])
      
      expect(job1?.priority).toBe(3) // First segment gets highest priority
      expect(job2?.priority).toBe(2)
      expect(job3?.priority).toBe(1) // Last segment gets lowest priority
    })

    it('should get jobs by task ID', async () => {
      const segments: Segment[] = [
        { ...mockSegment, id: 'segment-1', task_id: 'task-1' },
        { ...mockSegment, id: 'segment-2', task_id: 'task-1' },
        { ...mockSegment, id: 'segment-3', task_id: 'task-2' }
      ]

      await queueManager.addSegmentToQueue(segments[0])
      await queueManager.addSegmentToQueue(segments[1])
      await queueManager.addSegmentToQueue(segments[2])

      const task1Jobs = queueManager.getJobsByTaskId('task-1')
      const task2Jobs = queueManager.getJobsByTaskId('task-2')

      expect(task1Jobs).toHaveLength(2)
      expect(task2Jobs).toHaveLength(1)
      expect(task1Jobs[0].taskId).toBe('task-1')
      expect(task2Jobs[0].taskId).toBe('task-2')
    })
  })

  describe('Job Processing', () => {
    beforeEach(() => {
      // Mock successful responses
      mockDatabaseService.updateSegment.mockResolvedValue({} as any)
      mockAudioProcessingService.downloadSegment.mockResolvedValue(Buffer.from('audio data'))
      mockElevenLabsService.transcribeAudio.mockResolvedValue({
        taskId: 'elevenlabs-task-1'
      })
    })

    it('should process job successfully with async response', async () => {
      const jobId = await queueManager.addSegmentToQueue(mockSegment)
      
      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 200))
      
      const job = queueManager.getJob(jobId)
      expect(job?.status).toBe('completed')
      expect(job?.attempts).toBe(1)

      // Verify service calls
      expect(mockDatabaseService.updateSegment).toHaveBeenCalledWith('segment-1', {
        status: 'processing'
      })
      expect(mockAudioProcessingService.downloadSegment).toHaveBeenCalledWith(
        'segments/task-1/segment_1.mp3'
      )
      expect(mockElevenLabsService.transcribeAudio).toHaveBeenCalledWith(
        expect.any(Buffer),
        {
          modelId: 'scribe_v1',
          webhookUrl: 'https://test.example.com/api/webhook/elevenlabs',
          diarize: true,
          tagAudioEvents: true
        }
      )
      expect(mockDatabaseService.updateSegment).toHaveBeenCalledWith('segment-1', {
        elevenlabs_task_id: 'elevenlabs-task-1'
      })
    })

    it('should process job successfully with sync response', async () => {
      mockElevenLabsService.transcribeAudio.mockResolvedValue({
        result: { text: 'Transcribed text' }
      })

      const jobId = await queueManager.addSegmentToQueue(mockSegment)
      
      // Wait for processing to complete
      await new Promise(resolve => setTimeout(resolve, 200))
      
      const job = queueManager.getJob(jobId)
      expect(job?.status).toBe('completed')

      // Verify sync result was stored
      expect(mockDatabaseService.updateSegment).toHaveBeenCalledWith('segment-1', {
        status: 'completed',
        transcription_text: 'Transcribed text',
        completed_at: expect.any(String)
      })
    })

    it('should respect concurrency limits', async () => {
      // Add 4 jobs but limit is 2
      const segments = Array.from({ length: 4 }, (_, i) => ({
        ...mockSegment,
        id: `segment-${i + 1}`
      }))

      const jobIds = await Promise.all(
        segments.map(segment => queueManager.addSegmentToQueue(segment))
      )

      // Wait a bit for processing to start
      await new Promise(resolve => setTimeout(resolve, 50))

      // Check that only 2 jobs are processing
      const stats = queueManager.getQueueStats()
      expect(stats.processing).toBeLessThanOrEqual(2)
      expect(stats.pending + stats.processing).toBe(4)
    })
  })

  describe('Error Handling and Retries', () => {
    it('should retry on retryable errors', async () => {
      let callCount = 0
      mockElevenLabsService.transcribeAudio.mockImplementation(() => {
        callCount++
        if (callCount < 2) {
          throw new ExternalServiceError('ElevenLabs', 'Rate limit exceeded')
        }
        return Promise.resolve({ taskId: 'elevenlabs-task-1' })
      })

      mockDatabaseService.updateSegment.mockResolvedValue({} as any)
      mockAudioProcessingService.downloadSegment.mockResolvedValue(Buffer.from('audio data'))

      const jobId = await queueManager.addSegmentToQueue(mockSegment)
      
      // Wait for retry to complete (longer wait for retry logic)
      await new Promise(resolve => setTimeout(resolve, 500))
      
      const job = queueManager.getJob(jobId)
      expect(job?.status).toBe('completed')
      expect(job?.attempts).toBe(2)
      expect(callCount).toBe(2)
    })

    it('should fail permanently after max retries', async () => {
      mockElevenLabsService.transcribeAudio.mockRejectedValue(
        new ExternalServiceError('ElevenLabs', 'Service unavailable')
      )
      mockDatabaseService.updateSegment.mockResolvedValue({} as any)
      mockAudioProcessingService.downloadSegment.mockResolvedValue(Buffer.from('audio data'))

      const jobId = await queueManager.addSegmentToQueue(mockSegment)
      
      // Wait for all retries to complete
      await new Promise(resolve => setTimeout(resolve, 500))
      
      const job = queueManager.getJob(jobId)
      expect(job?.status).toBe('failed')
      expect(job?.attempts).toBe(2) // Max attempts reached
      expect(job?.error).toContain('Service unavailable')

      // Verify segment was marked as failed
      expect(mockDatabaseService.updateSegment).toHaveBeenCalledWith('segment-1', {
        status: 'failed',
        error_message: 'ElevenLabs: Service unavailable',
        completed_at: expect.any(String)
      })
    })

    it('should not retry non-retryable errors', async () => {
      mockElevenLabsService.transcribeAudio.mockRejectedValue(
        new Error('Invalid API key')
      )
      mockDatabaseService.updateSegment.mockResolvedValue({} as any)
      mockAudioProcessingService.downloadSegment.mockResolvedValue(Buffer.from('audio data'))

      const jobId = await queueManager.addSegmentToQueue(mockSegment)
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200))
      
      const job = queueManager.getJob(jobId)
      expect(job?.status).toBe('failed')
      expect(job?.attempts).toBe(1) // No retries for non-retryable error
    })

    it('should calculate exponential backoff correctly', async () => {
      const queueWithLongDelay = new QueueManager({
        retryDelayMs: 1000,
        retryBackoffMultiplier: 2,
        maxRetryDelayMs: 5000
      })

      let callCount = 0
      const callTimes: number[] = []
      
      mockElevenLabsService.transcribeAudio.mockImplementation(() => {
        callTimes.push(Date.now())
        callCount++
        throw new ExternalServiceError('ElevenLabs', 'Temporary error')
      })

      mockDatabaseService.updateSegment.mockResolvedValue({} as any)
      mockAudioProcessingService.downloadSegment.mockResolvedValue(Buffer.from('audio data'))

      await queueWithLongDelay.addSegmentToQueue(mockSegment)
      
      // Wait for retries
      await new Promise(resolve => setTimeout(resolve, 4000))
      
      queueWithLongDelay.stopProcessing()
      
      // Should have made initial attempt + retries
      expect(callCount).toBeGreaterThan(1)
      
      // Check that delays increased (allowing some tolerance for timing)
      if (callTimes.length >= 2) {
        const firstDelay = callTimes[1] - callTimes[0]
        expect(firstDelay).toBeGreaterThan(900) // Should be around 1000ms
      }
    })
  })

  describe('Queue Statistics', () => {
    it('should provide accurate queue statistics', async () => {
      // Add jobs with different outcomes
      mockDatabaseService.updateSegment.mockResolvedValue({} as any)
      mockAudioProcessingService.downloadSegment.mockResolvedValue(Buffer.from('audio data'))
      
      // Successful job
      mockElevenLabsService.transcribeAudio.mockResolvedValueOnce({
        taskId: 'elevenlabs-task-1'
      })
      
      // Failed job
      mockElevenLabsService.transcribeAudio.mockRejectedValueOnce(
        new Error('Non-retryable error')
      )

      // Third job that will succeed
      mockElevenLabsService.transcribeAudio.mockResolvedValueOnce({
        taskId: 'elevenlabs-task-2'
      })

      const segments = [
        { ...mockSegment, id: 'segment-1' },
        { ...mockSegment, id: 'segment-2' },
        { ...mockSegment, id: 'segment-3' }
      ]

      await Promise.all(segments.map(segment => queueManager.addSegmentToQueue(segment)))
      
      // Initial stats
      let stats = queueManager.getQueueStats()
      expect(stats.totalJobs).toBe(3)
      expect(stats.pending).toBe(3)
      
      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 300))
      
      stats = queueManager.getQueueStats()
      expect(stats.totalJobs).toBe(3)
      expect(stats.completed + stats.failed + stats.processing + stats.pending + stats.retrying).toBe(3)
    })
  })

  describe('Job Cleanup', () => {
    it('should clean up old completed jobs', async () => {
      const jobId = await queueManager.addSegmentToQueue(mockSegment)
      
      // Manually set job as completed and old
      const job = queueManager.getJob(jobId)!
      job.status = 'completed'
      job.createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000) // 25 hours ago
      
      const removedCount = queueManager.cleanupOldJobs(24 * 60 * 60 * 1000) // 24 hours
      
      expect(removedCount).toBe(1)
      expect(queueManager.getJob(jobId)).toBeUndefined()
    })

    it('should not clean up recent jobs', async () => {
      const jobId = await queueManager.addSegmentToQueue(mockSegment)
      
      const removedCount = queueManager.cleanupOldJobs(24 * 60 * 60 * 1000)
      
      expect(removedCount).toBe(0)
      expect(queueManager.getJob(jobId)).toBeDefined()
    })

    it('should cancel pending jobs for a task', async () => {
      const segments = [
        { ...mockSegment, id: 'segment-1', task_id: 'task-1' },
        { ...mockSegment, id: 'segment-2', task_id: 'task-1' },
        { ...mockSegment, id: 'segment-3', task_id: 'task-2' }
      ]

      await Promise.all(segments.map(segment => queueManager.addSegmentToQueue(segment)))
      
      const cancelledCount = queueManager.cancelTaskJobs('task-1')
      
      expect(cancelledCount).toBe(2)
      
      const task1Jobs = queueManager.getJobsByTaskId('task-1')
      const task2Jobs = queueManager.getJobsByTaskId('task-2')
      
      expect(task1Jobs.every(job => job.status === 'failed')).toBe(true)
      expect(task2Jobs.every(job => job.status === 'pending')).toBe(true)
    })
  })

  describe('Error Classification', () => {
    it('should correctly identify retryable errors', async () => {
      const retryableErrors = [
        new ExternalServiceError('ElevenLabs', 'Service unavailable'),
        new Error('Network timeout'),
        new Error('Connection refused'),
        new Error('Rate limit exceeded'),
        new Error('Internal server error'),
        new Error('Bad gateway'),
        new Error('Gateway timeout')
      ]

      for (const error of retryableErrors) {
        mockElevenLabsService.transcribeAudio.mockRejectedValueOnce(error)
        mockDatabaseService.updateSegment.mockResolvedValue({} as any)
        mockAudioProcessingService.downloadSegment.mockResolvedValue(Buffer.from('audio data'))

        const segment = { ...mockSegment, id: `segment-${Date.now()}` }
        const jobId = await queueManager.addSegmentToQueue(segment)
        
        // Wait for initial processing and retry scheduling
        await new Promise(resolve => setTimeout(resolve, 150))
        
        const job = queueManager.getJob(jobId)
        expect(['pending', 'retrying']).toContain(job?.status) // Should be scheduled for retry
        expect(job?.attempts).toBe(1)
      }
    })

    it('should correctly identify non-retryable errors', async () => {
      const nonRetryableErrors = [
        new Error('Invalid API key'),
        new Error('Authentication failed'),
        new Error('File not found'),
        new Error('Invalid request format')
      ]

      for (const error of nonRetryableErrors) {
        mockElevenLabsService.transcribeAudio.mockRejectedValueOnce(error)
        mockDatabaseService.updateSegment.mockResolvedValue({} as any)
        mockAudioProcessingService.downloadSegment.mockResolvedValue(Buffer.from('audio data'))

        const segment = { ...mockSegment, id: `segment-${Date.now()}` }
        const jobId = await queueManager.addSegmentToQueue(segment)
        
        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 150))
        
        const job = queueManager.getJob(jobId)
        expect(job?.status).toBe('failed') // Should fail immediately
        expect(job?.attempts).toBe(1)
      }
    })
  })
})