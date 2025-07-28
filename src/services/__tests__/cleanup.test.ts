import { CleanupService } from '../cleanup'
import { supabaseAdmin } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { config } from '@/lib/config'

// Mock dependencies
jest.mock('@/lib/supabase')
jest.mock('@/lib/logger')
jest.mock('@/lib/config')

const mockSupabaseAdmin = supabaseAdmin as jest.Mocked<typeof supabaseAdmin>
const mockLogger = logger as jest.Mocked<typeof logger>
const mockConfig = config as jest.Mocked<typeof config>

describe('CleanupService', () => {
  let cleanupService: CleanupService
  let mockStorage: any
  let mockFrom: any

  beforeEach(() => {
    cleanupService = new CleanupService()
    
    // Reset mocks
    jest.clearAllMocks()
    
    // Mock config
    mockConfig.app = {
      cleanupIntervalHours: 24,
      maxConcurrentRequests: 4,
      segmentDurationMinutes: 15,
      webhookBaseUrl: 'http://localhost:3000'
    }

    // Mock storage
    mockStorage = {
      from: jest.fn().mockReturnThis(),
      remove: jest.fn()
    }

    // Mock database queries
    mockFrom = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      single: jest.fn(),
      update: jest.fn().mockReturnThis()
    }

    mockSupabaseAdmin.storage = mockStorage
    mockSupabaseAdmin.from = jest.fn().mockReturnValue(mockFrom)
  })

  describe('performCleanup', () => {
    it('should successfully perform cleanup on completed tasks', async () => {
      const mockTasks = [
        {
          id: 'task-1',
          status: 'completed',
          converted_file_path: 'task-1/converted.mp3',
          created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() // 25 hours ago
        },
        {
          id: 'task-2',
          status: 'completed',
          converted_file_path: 'task-2/converted.mp3',
          created_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString() // 26 hours ago
        }
      ]

      const mockSegments = [
        {
          id: 'segment-1',
          task_id: 'task-1',
          file_path: 'task-1/segment-1.mp3'
        },
        {
          id: 'segment-2',
          task_id: 'task-2',
          file_path: 'task-2/segment-1.mp3'
        }
      ]

      // Mock getting tasks for cleanup - this is the first query
      mockFrom.single.mockResolvedValueOnce({ data: mockTasks, error: null })

      // Mock getting task with segments for each task
      mockFrom.single
        .mockResolvedValueOnce({ 
          data: { ...mockTasks[0], segments: [mockSegments[0]] }, 
          error: null 
        })
        .mockResolvedValueOnce({ 
          data: { ...mockTasks[1], segments: [mockSegments[1]] }, 
          error: null 
        })

      // Mock storage removal
      mockStorage.remove.mockResolvedValue({ error: null })

      const result = await cleanupService.performCleanup()

      expect(result.tasksProcessed).toBe(2)
      expect(result.filesDeleted).toBe(4) // 2 converted files + 2 segment files
      expect(result.errors).toHaveLength(0)
      expect(mockLogger.info).toHaveBeenCalledWith('Cleanup process completed', result)
    })

    it('should handle cleanup errors gracefully', async () => {
      const mockTasks = [
        {
          id: 'task-1',
          status: 'completed',
          converted_file_path: 'task-1/converted.mp3',
          created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
        }
      ]

      // Mock getting tasks for cleanup
      mockFrom.single.mockResolvedValueOnce({ data: mockTasks, error: null })

      // Mock getting task with segments - simulate error
      mockFrom.single.mockResolvedValueOnce({ 
        data: null, 
        error: { message: 'Database error' } 
      })

      const result = await cleanupService.performCleanup()

      expect(result.tasksProcessed).toBe(0)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].taskId).toBe('task-1')
      expect(mockLogger.error).toHaveBeenCalled()
    })

    it('should process tasks in batches', async () => {
      const mockTasks = Array.from({ length: 75 }, (_, i) => ({
        id: `task-${i}`,
        status: 'completed',
        converted_file_path: `task-${i}/converted.mp3`,
        created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString()
      }))

      // Mock getting tasks for cleanup
      mockFrom.single.mockResolvedValueOnce({ data: mockTasks, error: null })

      // Mock getting task with segments for all tasks
      mockTasks.forEach((task, index) => {
        mockFrom.single.mockResolvedValueOnce({ 
          data: { ...task, segments: [] }, 
          error: null 
        })
      })

      // Mock storage removal
      mockStorage.remove.mockResolvedValue({ error: null })

      const result = await cleanupService.performCleanup({ batchSize: 25 })

      expect(result.tasksProcessed).toBe(75)
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Found 75 tasks for cleanup')
      )
    })
  })

  describe('cleanupTask', () => {
    it('should successfully cleanup a specific completed task', async () => {
      const taskId = 'test-task-id'
      const mockTask = {
        id: taskId,
        status: 'completed',
        converted_file_path: 'test-task/converted.mp3',
        segments: [
          { id: 'seg-1', file_path: 'test-task/segment-1.mp3' },
          { id: 'seg-2', file_path: 'test-task/segment-2.mp3' }
        ]
      }

      // Mock getting task with segments
      mockFrom.single.mockResolvedValueOnce({ data: mockTask, error: null })

      // Mock storage removal
      mockStorage.remove.mockResolvedValue({ error: null })

      const result = await cleanupService.cleanupTask(taskId)

      expect(result).toBe(true)
      expect(mockStorage.remove).toHaveBeenCalledTimes(3) // 1 converted + 2 segments
      expect(mockLogger.info).toHaveBeenCalledWith('Task cleanup completed', {
        taskId,
        filesDeleted: 3
      })
    })

    it('should not cleanup tasks in processing state', async () => {
      const taskId = 'processing-task'
      const mockTask = {
        id: taskId,
        status: 'processing',
        converted_file_path: 'test-task/converted.mp3',
        segments: []
      }

      // Mock getting task with segments
      mockFrom.single.mockResolvedValueOnce({ data: mockTask, error: null })

      const result = await cleanupService.cleanupTask(taskId)

      expect(result).toBe(false)
      expect(mockStorage.remove).not.toHaveBeenCalled()
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Cannot cleanup task in processing state',
        { taskId, status: 'processing' }
      )
    })

    it('should handle task not found', async () => {
      const taskId = 'non-existent-task'

      // Mock task not found
      mockFrom.single.mockResolvedValueOnce({ 
        data: null, 
        error: { code: 'PGRST116' } 
      })

      const result = await cleanupService.cleanupTask(taskId)

      expect(result).toBe(false)
      expect(mockLogger.warn).toHaveBeenCalledWith('Task not found for cleanup', { taskId })
    })

    it('should retry file deletion on failure', async () => {
      const taskId = 'retry-task'
      const mockTask = {
        id: taskId,
        status: 'completed',
        converted_file_path: 'test-task/converted.mp3',
        segments: []
      }

      // Mock getting task with segments
      mockFrom.single.mockResolvedValueOnce({ data: mockTask, error: null })

      // Mock storage removal - fail first two times, succeed on third
      mockStorage.remove
        .mockResolvedValueOnce({ error: { message: 'Network error' } })
        .mockResolvedValueOnce({ error: { message: 'Network error' } })
        .mockResolvedValueOnce({ error: null })

      const result = await cleanupService.cleanupTask(taskId, { maxRetries: 3 })

      expect(result).toBe(true)
      expect(mockStorage.remove).toHaveBeenCalledTimes(3)
      expect(mockLogger.warn).toHaveBeenCalledTimes(2) // Two failed attempts
    })
  })

  describe('getCleanupStats', () => {
    it('should return cleanup statistics', async () => {
      // Mock task counts
      mockFrom.single
        .mockResolvedValueOnce({ count: 100, error: null }) // total tasks
        .mockResolvedValueOnce({ count: 75, error: null })  // completed tasks
        .mockResolvedValueOnce({ count: 10, error: null })  // failed tasks

      const stats = await cleanupService.getCleanupStats()

      expect(stats.totalTasks).toBe(100)
      expect(stats.completedTasks).toBe(75)
      expect(stats.failedTasks).toBe(10)
      expect(stats.lastCleanup).toBeInstanceOf(Date)
    })

    it('should handle database errors when getting stats', async () => {
      // Mock database error
      mockFrom.single.mockResolvedValueOnce({ 
        count: null, 
        error: { message: 'Database connection error' } 
      })

      await expect(cleanupService.getCleanupStats()).rejects.toThrow(
        'Failed to get task count: Database connection error'
      )
    })
  })

  describe('scheduleCleanup', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should schedule automatic cleanup', () => {
      const intervalId = cleanupService.scheduleCleanup()

      expect(intervalId).toBeDefined()
      expect(mockLogger.info).toHaveBeenCalledWith('Scheduling automatic cleanup', {
        intervalHours: 24,
        intervalMs: 24 * 60 * 60 * 1000
      })

      clearInterval(intervalId)
    })

    it('should run cleanup at scheduled intervals', async () => {
      // Mock successful cleanup
      const mockTasks = []
      mockFrom.single.mockResolvedValue({ data: mockTasks, error: null })

      const intervalId = cleanupService.scheduleCleanup()

      // Fast-forward time to trigger cleanup
      jest.advanceTimersByTime(24 * 60 * 60 * 1000)

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(mockLogger.info).toHaveBeenCalledWith('Running scheduled cleanup')

      clearInterval(intervalId)
    })

    it('should handle scheduled cleanup errors', async () => {
      // Mock cleanup error
      mockFrom.single.mockRejectedValue(new Error('Cleanup failed'))

      const intervalId = cleanupService.scheduleCleanup()

      // Fast-forward time to trigger cleanup
      jest.advanceTimersByTime(24 * 60 * 60 * 1000)

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Scheduled cleanup failed',
        expect.any(Error)
      )

      clearInterval(intervalId)
    })
  })

  describe('error handling and retry logic', () => {
    it('should implement exponential backoff for file deletion retries', async () => {
      const taskId = 'backoff-task'
      const mockTask = {
        id: taskId,
        status: 'completed',
        converted_file_path: 'test-task/converted.mp3',
        segments: []
      }

      // Mock getting task with segments
      mockFrom.single.mockResolvedValueOnce({ data: mockTask, error: null })

      // Mock storage removal - always fail
      mockStorage.remove.mockResolvedValue({ error: { message: 'Persistent error' } })

      // Spy on setTimeout to verify exponential backoff
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout')

      const result = await cleanupService.cleanupTask(taskId, { 
        maxRetries: 2, 
        retryDelayMs: 100 
      })

      expect(result).toBe(true) // Task cleanup still succeeds even if file deletion fails
      expect(mockStorage.remove).toHaveBeenCalledTimes(3) // Initial + 2 retries
      
      // Verify exponential backoff delays: 100ms, 200ms
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 100)
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 200)

      setTimeoutSpy.mockRestore()
    })

    it('should log detailed error information', async () => {
      const taskId = 'error-task'

      // Mock database error
      mockFrom.single.mockResolvedValueOnce({ 
        data: null, 
        error: { message: 'Connection timeout' } 
      })

      const result = await cleanupService.cleanupTask(taskId)

      expect(result).toBe(false)
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Task cleanup failed',
        expect.any(Error),
        { taskId }
      )
    })
  })
})