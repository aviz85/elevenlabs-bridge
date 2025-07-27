import { databaseService } from '@/services/database'
import { mockAudioService } from '@/services/mock-audio'
import { validateFile, validateWebhookUrl, validateTaskId } from '@/utils/validation'

// Mock Supabase for integration tests
const mockSupabaseAdmin = {
  from: jest.fn(() => mockSupabaseAdmin),
  insert: jest.fn(() => mockSupabaseAdmin),
  update: jest.fn(() => mockSupabaseAdmin),
  select: jest.fn(() => mockSupabaseAdmin),
  eq: jest.fn(() => mockSupabaseAdmin),
  order: jest.fn(() => mockSupabaseAdmin),
  single: jest.fn(),
  raw: jest.fn((sql: string) => ({ sql }))
}

jest.mock('@/lib/supabase', () => ({
  supabaseAdmin: mockSupabaseAdmin
}))

describe('Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Complete File Processing Workflow', () => {
    it('should handle complete workflow from file upload to segmentation', async () => {
      // 1. Validate input file
      const file = new File(['test audio content'], 'test-audio.mp3', { type: 'audio/mpeg' })
      const webhookUrl = 'https://example.com/webhook'
      
      expect(() => validateFile(file)).not.toThrow()
      expect(() => validateWebhookUrl(webhookUrl)).not.toThrow()

      // 2. Convert audio to MP3
      const { buffer, filePath } = await mockAudioService.convertToMp3(file)
      expect(buffer).toBeInstanceOf(Buffer)
      expect(filePath).toMatch(/\.mp3$/)

      // 3. Get audio duration
      const duration = await mockAudioService.getAudioDuration(file)
      expect(duration).toBeGreaterThan(0)

      // 4. Split audio into segments
      const segments = await mockAudioService.splitAudio(filePath, duration)
      expect(segments.length).toBeGreaterThan(0)
      expect(segments[0]).toHaveProperty('startTime')
      expect(segments[0]).toHaveProperty('endTime')
      expect(segments[0]).toHaveProperty('filePath')

      // 5. Create task in database
      const mockTask = {
        id: 'task-123',
        client_webhook_url: webhookUrl,
        original_filename: file.name,
        converted_file_path: filePath,
        status: 'processing' as const,
        total_segments: segments.length,
        completed_segments: 0,
        created_at: new Date().toISOString()
      }

      mockSupabaseAdmin.single.mockResolvedValue({ data: mockTask, error: null })

      const createdTask = await databaseService.createTask({
        client_webhook_url: webhookUrl,
        original_filename: file.name,
        converted_file_path: filePath,
        total_segments: segments.length
      })

      expect(createdTask).toEqual(mockTask)

      // 6. Create segments in database
      const mockSegments = segments.map((segment, index) => ({
        id: `segment-${index}`,
        task_id: mockTask.id,
        file_path: segment.filePath,
        start_time: segment.startTime,
        end_time: segment.endTime,
        status: 'pending' as const,
        created_at: new Date().toISOString()
      }))

      for (let i = 0; i < segments.length; i++) {
        mockSupabaseAdmin.single.mockResolvedValueOnce({ data: mockSegments[i], error: null })
        
        const createdSegment = await databaseService.createSegment({
          task_id: mockTask.id,
          file_path: segments[i].filePath,
          start_time: segments[i].startTime,
          end_time: segments[i].endTime
        })

        expect(createdSegment).toEqual(mockSegments[i])
      }

      // 7. Verify task ID validation
      expect(() => validateTaskId(mockTask.id)).not.toThrow()
    })

    it('should handle large file that requires multiple segments', async () => {
      // Create a large file (simulate 45 minutes of audio)
      const largeContent = new Array(45 * 1024 * 1024).fill('a').join('') // 45MB
      const largeFile = new File([largeContent], 'large-audio.mp3', { type: 'audio/mpeg' })

      // Validate file
      expect(() => validateFile(largeFile)).not.toThrow()

      // Get duration (should be > 15 minutes)
      const duration = await mockAudioService.getAudioDuration(largeFile)
      expect(duration).toBeGreaterThan(900) // More than 15 minutes

      // Split into segments
      const segments = await mockAudioService.splitAudio('large-audio.mp3', duration)
      expect(segments.length).toBeGreaterThan(1) // Should create multiple segments

      // Verify segments are properly ordered and continuous
      for (let i = 0; i < segments.length - 1; i++) {
        expect(segments[i].endTime).toBe(segments[i + 1].startTime)
      }

      // Verify last segment ends at total duration
      expect(segments[segments.length - 1].endTime).toBe(duration)
    })

    it('should handle error scenarios gracefully', async () => {
      // Test invalid file
      const invalidFile = new File(['content'], 'test.txt', { type: 'text/plain' })
      expect(() => validateFile(invalidFile)).toThrow('Unsupported file format')

      // Test invalid webhook URL
      expect(() => validateWebhookUrl('not-a-url')).toThrow('Invalid webhook URL format')

      // Test invalid task ID
      expect(() => validateTaskId('not-a-uuid')).toThrow('Invalid task ID format')

      // Test database error handling
      mockSupabaseAdmin.single.mockResolvedValue({
        data: null,
        error: { message: 'Database error' }
      })

      await expect(databaseService.createTask({
        client_webhook_url: 'https://example.com/webhook',
        original_filename: 'test.mp3'
      })).rejects.toThrow('Failed to create task: Database error')
    })
  })

  describe('Service Integration', () => {
    it('should integrate audio service with database service', async () => {
      const file = new File(['audio content'], 'integration-test.mp3', { type: 'audio/mpeg' })
      
      // Process audio
      const { filePath } = await mockAudioService.convertToMp3(file)
      const duration = await mockAudioService.getAudioDuration(file)
      const segments = await mockAudioService.splitAudio(filePath, duration)

      // Create task
      const mockTask = {
        id: 'integration-task-123',
        client_webhook_url: 'https://example.com/webhook',
        original_filename: file.name,
        converted_file_path: filePath,
        status: 'processing' as const,
        total_segments: segments.length,
        completed_segments: 0,
        created_at: new Date().toISOString()
      }

      mockSupabaseAdmin.single.mockResolvedValue({ data: mockTask, error: null })

      const task = await databaseService.createTask({
        client_webhook_url: 'https://example.com/webhook',
        original_filename: file.name,
        converted_file_path: filePath,
        total_segments: segments.length
      })

      expect(task.total_segments).toBe(segments.length)
      expect(task.converted_file_path).toBe(filePath)

      // Simulate segment processing completion
      mockSupabaseAdmin.single.mockResolvedValue({
        data: { ...mockTask, completed_segments: 1 },
        error: null
      })

      const updatedTask = await databaseService.incrementCompletedSegments(task.id)
      expect(updatedTask.completed_segments).toBe(1)
    })
  })

  describe('Performance and Timing', () => {
    it('should complete audio processing within reasonable time limits', async () => {
      const file = new File(['test content'], 'performance-test.mp3', { type: 'audio/mpeg' })
      
      const start = Date.now()
      
      // Run all audio operations
      const [{ filePath }, duration] = await Promise.all([
        mockAudioService.convertToMp3(file),
        mockAudioService.getAudioDuration(file)
      ])
      
      const segments = await mockAudioService.splitAudio(filePath, duration)
      
      const totalTime = Date.now() - start
      
      // Should complete within 10 seconds (generous limit for mocked operations)
      expect(totalTime).toBeLessThan(10000)
      expect(segments.length).toBeGreaterThan(0)
    })

    it('should handle concurrent operations', async () => {
      const files = [
        new File(['content1'], 'concurrent1.mp3', { type: 'audio/mpeg' }),
        new File(['content2'], 'concurrent2.mp3', { type: 'audio/mpeg' }),
        new File(['content3'], 'concurrent3.mp3', { type: 'audio/mpeg' })
      ]

      const start = Date.now()
      
      // Process multiple files concurrently
      const results = await Promise.all(
        files.map(async (file) => {
          const { filePath } = await mockAudioService.convertToMp3(file)
          const duration = await mockAudioService.getAudioDuration(file)
          const segments = await mockAudioService.splitAudio(filePath, duration)
          return { filePath, duration, segments }
        })
      )

      const totalTime = Date.now() - start
      
      expect(results).toHaveLength(3)
      expect(totalTime).toBeLessThan(15000) // Should be faster than sequential processing
      
      // Verify all results are valid
      results.forEach(result => {
        expect(result.filePath).toMatch(/\.mp3$/)
        expect(result.duration).toBeGreaterThan(0)
        expect(result.segments.length).toBeGreaterThan(0)
      })
    })
  })
})