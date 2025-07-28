import { NextApiRequest, NextApiResponse } from 'next'
import {
  withErrorHandling,
  withMethodValidation,
  withRateLimit,
  withTimeout,
  withValidation,
  compose,
  createHealthCheckHandler
} from '../middleware'
import { AppError, ValidationError } from '../errors'

// Mock logger
jest.mock('../logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    apiRequest: jest.fn()
  }
}))

// Mock handleApiError
jest.mock('../errors', () => ({
  ...jest.requireActual('../errors'),
  handleApiError: jest.fn().mockReturnValue({
    json: jest.fn().mockResolvedValue({ error: 'mocked error' }),
    status: 500
  })
}))

describe('Middleware', () => {
  let mockReq: Partial<NextApiRequest>
  let mockRes: Partial<NextApiResponse>
  let mockHandler: jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
    
    mockReq = {
      method: 'POST',
      url: '/api/test',
      query: { taskId: 'task123' },
      headers: {
        'user-agent': 'test-agent',
        'content-type': 'application/json',
        'x-forwarded-for': '127.0.0.1'
      },
      socket: { remoteAddress: '127.0.0.1' }
    }
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      statusCode: 200
    }
    
    mockHandler = jest.fn().mockResolvedValue(undefined)
  })

  describe('withErrorHandling', () => {
    it('should execute handler successfully', async () => {
      const wrappedHandler = withErrorHandling(mockHandler)
      
      await wrappedHandler(mockReq as NextApiRequest, mockRes as NextApiResponse)
      
      expect(mockHandler).toHaveBeenCalledWith(
        mockReq,
        mockRes,
        expect.objectContaining({
          operation: 'POST /api/test',
          taskId: 'task123'
        })
      )
    })

    it('should handle errors and return error response', async () => {
      const error = new ValidationError('Invalid input')
      mockHandler.mockRejectedValue(error)
      
      const wrappedHandler = withErrorHandling(mockHandler)
      
      await wrappedHandler(mockReq as NextApiRequest, mockRes as NextApiResponse)
      
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'mocked error' })
    })

    it('should extract custom context', async () => {
      const extractContext = jest.fn().mockReturnValue({ customField: 'value' })
      const wrappedHandler = withErrorHandling(mockHandler, { extractContext })
      
      await wrappedHandler(mockReq as NextApiRequest, mockRes as NextApiResponse)
      
      expect(extractContext).toHaveBeenCalledWith(mockReq)
      expect(mockHandler).toHaveBeenCalledWith(
        mockReq,
        mockRes,
        expect.objectContaining({
          customField: 'value'
        })
      )
    })

    it('should log API requests', async () => {
      const { logger } = require('../logger')
      const wrappedHandler = withErrorHandling(mockHandler)
      
      await wrappedHandler(mockReq as NextApiRequest, mockRes as NextApiResponse)
      
      expect(logger.info).toHaveBeenCalledWith(
        'API request started',
        expect.objectContaining({
          method: 'POST',
          url: '/api/test'
        })
      )
      
      expect(logger.apiRequest).toHaveBeenCalledWith(
        'POST',
        '/api/test',
        200,
        expect.any(Number),
        expect.any(Object)
      )
    })
  })

  describe('withMethodValidation', () => {
    it('should allow valid methods', async () => {
      const wrappedHandler = withMethodValidation(['POST', 'GET'])(mockHandler)
      
      await wrappedHandler(mockReq as NextApiRequest, mockRes as NextApiResponse, {})
      
      expect(mockHandler).toHaveBeenCalled()
    })

    it('should reject invalid methods', async () => {
      mockReq.method = 'DELETE'
      const wrappedHandler = withMethodValidation(['POST', 'GET'])(mockHandler)
      
      await expect(
        wrappedHandler(mockReq as NextApiRequest, mockRes as NextApiResponse, {})
      ).rejects.toThrow(AppError)
      
      expect(mockHandler).not.toHaveBeenCalled()
    })

    it('should handle missing method', async () => {
      mockReq.method = undefined
      const wrappedHandler = withMethodValidation(['POST'])(mockHandler)
      
      await expect(
        wrappedHandler(mockReq as NextApiRequest, mockRes as NextApiResponse, {})
      ).rejects.toThrow(AppError)
    })
  })

  describe('withRateLimit', () => {
    beforeEach(() => {
      // Clear any existing rate limit data
      jest.clearAllTimers()
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should allow requests within limit', async () => {
      const wrappedHandler = withRateLimit({
        windowMs: 60000,
        maxRequests: 5
      })(mockHandler)
      
      // Make 3 requests
      for (let i = 0; i < 3; i++) {
        await wrappedHandler(mockReq as NextApiRequest, mockRes as NextApiResponse, {})
      }
      
      expect(mockHandler).toHaveBeenCalledTimes(3)
    })

    it('should reject requests exceeding limit', async () => {
      const wrappedHandler = withRateLimit({
        windowMs: 60000,
        maxRequests: 2
      })(mockHandler)
      
      // Make 2 requests (should succeed)
      await wrappedHandler(mockReq as NextApiRequest, mockRes as NextApiResponse, {})
      await wrappedHandler(mockReq as NextApiRequest, mockRes as NextApiResponse, {})
      
      // Third request should fail
      await expect(
        wrappedHandler(mockReq as NextApiRequest, mockRes as NextApiResponse, {})
      ).rejects.toThrow(AppError)
      
      expect(mockHandler).toHaveBeenCalledTimes(2)
    })

    it('should use custom key generator', async () => {
      const keyGenerator = jest.fn().mockReturnValue('custom-key')
      const wrappedHandler = withRateLimit({
        windowMs: 60000,
        maxRequests: 1,
        keyGenerator
      })(mockHandler)
      
      await wrappedHandler(mockReq as NextApiRequest, mockRes as NextApiResponse, {})
      
      expect(keyGenerator).toHaveBeenCalledWith(mockReq)
      expect(mockHandler).toHaveBeenCalledTimes(1)
    })
  })

  describe('withTimeout', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('should complete within timeout', async () => {
      const wrappedHandler = withTimeout(5000)(mockHandler)
      
      const promise = wrappedHandler(mockReq as NextApiRequest, mockRes as NextApiResponse, {})
      
      // Fast-forward time but not past timeout
      jest.advanceTimersByTime(1000)
      
      await promise
      
      expect(mockHandler).toHaveBeenCalled()
    })

    it('should timeout long-running requests', async () => {
      mockHandler.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 10000)))
      const wrappedHandler = withTimeout(1000)(mockHandler)
      
      const promise = wrappedHandler(mockReq as NextApiRequest, mockRes as NextApiResponse, {})
      
      // Fast-forward past timeout
      jest.advanceTimersByTime(1500)
      
      await expect(promise).rejects.toThrow(AppError)
    })
  })

  describe('withValidation', () => {
    it('should run validation successfully', async () => {
      const validator = jest.fn().mockResolvedValue(undefined)
      const wrappedHandler = withValidation(validator)(mockHandler)
      
      await wrappedHandler(mockReq as NextApiRequest, mockRes as NextApiResponse, {})
      
      expect(validator).toHaveBeenCalledWith(mockReq)
      expect(mockHandler).toHaveBeenCalled()
    })

    it('should handle validation errors', async () => {
      const validator = jest.fn().mockRejectedValue(new ValidationError('Invalid data'))
      const wrappedHandler = withValidation(validator)(mockHandler)
      
      await expect(
        wrappedHandler(mockReq as NextApiRequest, mockRes as NextApiResponse, {})
      ).rejects.toThrow(ValidationError)
      
      expect(mockHandler).not.toHaveBeenCalled()
    })

    it('should handle synchronous validation', async () => {
      const validator = jest.fn().mockImplementation((req) => {
        if (!req.body) throw new ValidationError('Body required')
      })
      const wrappedHandler = withValidation(validator)(mockHandler)
      
      await expect(
        wrappedHandler(mockReq as NextApiRequest, mockRes as NextApiResponse, {})
      ).rejects.toThrow(ValidationError)
    })
  })

  describe('compose', () => {
    it('should compose multiple middleware functions', async () => {
      const middleware1 = jest.fn().mockImplementation(handler => handler)
      const middleware2 = jest.fn().mockImplementation(handler => handler)
      
      const composedHandler = compose(middleware1, middleware2)(mockHandler)
      
      await composedHandler(mockReq as NextApiRequest, mockRes as NextApiResponse, {})
      
      expect(middleware1).toHaveBeenCalled()
      expect(middleware2).toHaveBeenCalled()
      expect(mockHandler).toHaveBeenCalled()
    })

    it('should apply middleware in correct order', async () => {
      const order: string[] = []
      
      const middleware1 = (handler: any) => async (...args: any[]) => {
        order.push('middleware1-before')
        await handler(...args)
        order.push('middleware1-after')
      }
      
      const middleware2 = (handler: any) => async (...args: any[]) => {
        order.push('middleware2-before')
        await handler(...args)
        order.push('middleware2-after')
      }
      
      const testHandler = async () => {
        order.push('handler')
      }
      
      const composedHandler = compose(middleware1, middleware2)(testHandler)
      
      await composedHandler(mockReq as NextApiRequest, mockRes as NextApiResponse, {})
      
      expect(order).toEqual([
        'middleware1-before',
        'middleware2-before',
        'handler',
        'middleware2-after',
        'middleware1-after'
      ])
    })
  })

  describe('createHealthCheckHandler', () => {
    it('should return healthy status when all checks pass', async () => {
      const checks = {
        database: jest.fn().mockResolvedValue(true),
        external: jest.fn().mockResolvedValue(true)
      }
      
      const handler = createHealthCheckHandler(checks)
      
      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse)
      
      expect(mockRes.status).toHaveBeenCalledWith(200)
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          healthy: true,
          checks: expect.objectContaining({
            database: expect.objectContaining({ healthy: true }),
            external: expect.objectContaining({ healthy: true })
          })
        })
      )
    })

    it('should return unhealthy status when checks fail', async () => {
      const checks = {
        database: jest.fn().mockResolvedValue(true),
        external: jest.fn().mockRejectedValue(new Error('Service down'))
      }
      
      const handler = createHealthCheckHandler(checks)
      
      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse)
      
      expect(mockRes.status).toHaveBeenCalledWith(503)
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          healthy: false,
          checks: expect.objectContaining({
            database: expect.objectContaining({ healthy: true }),
            external: expect.objectContaining({ 
              healthy: false,
              error: 'Service down'
            })
          })
        })
      )
    })

    it('should include duration for each check', async () => {
      const checks = {
        fast: jest.fn().mockResolvedValue(true),
        slow: jest.fn().mockImplementation(() => 
          new Promise(resolve => setTimeout(() => resolve(true), 100))
        )
      }
      
      const handler = createHealthCheckHandler(checks)
      
      await handler(mockReq as NextApiRequest, mockRes as NextApiResponse)
      
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          checks: expect.objectContaining({
            fast: expect.objectContaining({ 
              duration: expect.any(Number)
            }),
            slow: expect.objectContaining({ 
              duration: expect.any(Number)
            })
          })
        })
      )
    })
  })
})