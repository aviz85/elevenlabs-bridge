const { createMocks } = require('node-mocks-http')
import handler from '@/pages/api/cleanup'
import { cleanupService } from '@/services/cleanup'
import { logger } from '@/lib/logger'

// Mock dependencies
jest.mock('@/services/cleanup')
jest.mock('@/lib/logger')

const mockCleanupService = cleanupService as jest.Mocked<typeof cleanupService>
const mockLogger = logger as jest.Mocked<typeof logger>

describe('/api/cleanup integration tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('POST /api/cleanup', () => {
    it('should trigger general cleanup successfully', async () => {
      const mockResult = {
        tasksProcessed: 5,
        filesDeleted: 15,
        errors: []
      }

      mockCleanupService.performCleanup.mockResolvedValue(mockResult)

      const { req, res } = createMocks({
        method: 'POST',
        body: {}
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(200)
      expect(JSON.parse(res._getData())).toEqual({
        success: true,
        message: 'Cleanup completed successfully',
        result: mockResult
      })
      expect(mockCleanupService.performCleanup).toHaveBeenCalledWith({
        maxRetries: 3,
        batchSize: 25
      })
    })

    it('should trigger cleanup for specific task', async () => {
      const taskId = 'test-task-id'
      mockCleanupService.cleanupTask.mockResolvedValue(true)

      const { req, res } = createMocks({
        method: 'POST',
        body: { taskId }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(200)
      expect(JSON.parse(res._getData())).toEqual({
        success: true,
        message: `Task ${taskId} cleaned up successfully`
      })
      expect(mockCleanupService.cleanupTask).toHaveBeenCalledWith(taskId, {
        maxRetries: 3
      })
    })

    it('should handle force cleanup with increased retries', async () => {
      const mockResult = {
        tasksProcessed: 3,
        filesDeleted: 8,
        errors: []
      }

      mockCleanupService.performCleanup.mockResolvedValue(mockResult)

      const { req, res } = createMocks({
        method: 'POST',
        body: { force: true }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(200)
      expect(mockCleanupService.performCleanup).toHaveBeenCalledWith({
        maxRetries: 5,
        batchSize: 25
      })
    })

    it('should handle task cleanup failure', async () => {
      const taskId = 'failed-task-id'
      mockCleanupService.cleanupTask.mockResolvedValue(false)

      const { req, res } = createMocks({
        method: 'POST',
        body: { taskId }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(400)
      expect(JSON.parse(res._getData())).toEqual({
        success: false,
        message: `Failed to clean up task ${taskId}`
      })
    })

    it('should handle cleanup service errors', async () => {
      const error = new Error('Cleanup service error')
      mockCleanupService.performCleanup.mockRejectedValue(error)

      const { req, res } = createMocks({
        method: 'POST',
        body: {}
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(500)
      expect(JSON.parse(res._getData())).toEqual({
        success: false,
        error: 'Internal server error',
        message: 'Cleanup service error'
      })
      expect(mockLogger.error).toHaveBeenCalledWith('Cleanup API error', error)
    })
  })

  describe('GET /api/cleanup', () => {
    it('should return cleanup statistics', async () => {
      const mockStats = {
        totalTasks: 100,
        completedTasks: 85,
        failedTasks: 5,
        filesDeleted: 250,
        errors: 2,
        lastCleanup: new Date('2024-01-15T10:00:00Z')
      }

      mockCleanupService.getCleanupStats.mockResolvedValue(mockStats)

      const { req, res } = createMocks({
        method: 'GET'
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(200)
      expect(JSON.parse(res._getData())).toEqual({
        success: true,
        stats: {
          ...mockStats,
          lastCleanup: mockStats.lastCleanup.toISOString()
        }
      })
    })

    it('should handle stats retrieval errors', async () => {
      const error = new Error('Database connection error')
      mockCleanupService.getCleanupStats.mockRejectedValue(error)

      const { req, res } = createMocks({
        method: 'GET'
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(500)
      expect(JSON.parse(res._getData())).toEqual({
        success: false,
        error: 'Internal server error',
        message: 'Database connection error'
      })
      expect(mockLogger.error).toHaveBeenCalledWith('Cleanup stats API error', error)
    })
  })

  describe('Method validation', () => {
    it('should reject unsupported HTTP methods', async () => {
      const { req, res } = createMocks({
        method: 'DELETE'
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(405)
      expect(res._getHeaders()).toEqual(
        expect.objectContaining({
          allow: ['GET', 'POST']
        })
      )
      expect(JSON.parse(res._getData())).toEqual({
        error: 'Method not allowed'
      })
    })
  })

  describe('Request validation', () => {
    it('should handle malformed request bodies gracefully', async () => {
      mockCleanupService.performCleanup.mockResolvedValue({
        tasksProcessed: 0,
        filesDeleted: 0,
        errors: []
      })

      const { req, res } = createMocks({
        method: 'POST',
        body: { invalidField: 'invalid' }
      })

      await handler(req, res)

      expect(res._getStatusCode()).toBe(200)
      expect(mockCleanupService.performCleanup).toHaveBeenCalled()
    })
  })

  describe('Logging integration', () => {
    it('should log cleanup triggers', async () => {
      const taskId = 'log-test-task'
      mockCleanupService.cleanupTask.mockResolvedValue(true)

      const { req, res } = createMocks({
        method: 'POST',
        body: { taskId, force: true }
      })

      await handler(req, res)

      expect(mockLogger.info).toHaveBeenCalledWith('Manual cleanup triggered', {
        taskId,
        force: true
      })
    })

    it('should log general cleanup triggers', async () => {
      mockCleanupService.performCleanup.mockResolvedValue({
        tasksProcessed: 1,
        filesDeleted: 3,
        errors: []
      })

      const { req, res } = createMocks({
        method: 'POST',
        body: {}
      })

      await handler(req, res)

      expect(mockLogger.info).toHaveBeenCalledWith('Manual cleanup triggered', {
        taskId: undefined,
        force: false
      })
    })
  })
})