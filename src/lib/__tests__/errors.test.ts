import { NextResponse } from 'next/server'
import {
  AppError,
  ValidationError,
  NotFoundError,
  ExternalServiceError,
  DatabaseError,
  AuthenticationError,
  AuthorizationError,
  RateLimitError,
  TimeoutError,
  CircuitBreakerError,
  BusinessLogicError,
  handleApiError,
  getErrorSeverity,
  withErrorHandling
} from '../errors'

// Mock NextResponse
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, options) => ({
      json: jest.fn().mockResolvedValue(data),
      status: options?.status || 200,
      data,
      options
    }))
  }
}))

// Mock logger
jest.mock('../logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn()
  }
}))

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create an AppError with correct properties', () => {
      const error = new AppError('TEST_ERROR', 'Test message', 400, { detail: 'test' }, true, 'VALIDATION')
      
      expect(error.name).toBe('AppError')
      expect(error.code).toBe('TEST_ERROR')
      expect(error.message).toBe('Test message')
      expect(error.statusCode).toBe(400)
      expect(error.details).toEqual({ detail: 'test' })
      expect(error.isRetryable).toBe(true)
      expect(error.category).toBe('VALIDATION')
    })

    it('should default to status code 500 and non-retryable', () => {
      const error = new AppError('TEST_ERROR', 'Test message')
      expect(error.statusCode).toBe(500)
      expect(error.isRetryable).toBe(false)
      expect(error.category).toBe('SYSTEM')
    })
  })

  describe('ValidationError', () => {
    it('should create a ValidationError with correct properties', () => {
      const error = new ValidationError('Invalid input', { field: 'email' })
      
      expect(error.code).toBe('VALIDATION_ERROR')
      expect(error.message).toBe('Invalid input')
      expect(error.statusCode).toBe(400)
      expect(error.details).toEqual({ field: 'email' })
      expect(error.isRetryable).toBe(false)
      expect(error.category).toBe('VALIDATION')
    })
  })

  describe('AuthenticationError', () => {
    it('should create an AuthenticationError with default message', () => {
      const error = new AuthenticationError()
      
      expect(error.code).toBe('AUTHENTICATION_ERROR')
      expect(error.message).toBe('Authentication failed')
      expect(error.statusCode).toBe(401)
      expect(error.category).toBe('AUTHENTICATION')
    })

    it('should create an AuthenticationError with custom message', () => {
      const error = new AuthenticationError('Invalid API key', { key: 'xxx' })
      
      expect(error.message).toBe('Invalid API key')
      expect(error.details).toEqual({ key: 'xxx' })
    })
  })

  describe('AuthorizationError', () => {
    it('should create an AuthorizationError with default message', () => {
      const error = new AuthorizationError()
      
      expect(error.code).toBe('AUTHORIZATION_ERROR')
      expect(error.message).toBe('Access denied')
      expect(error.statusCode).toBe(403)
      expect(error.category).toBe('AUTHORIZATION')
    })
  })

  describe('RateLimitError', () => {
    it('should create a RateLimitError with retry information', () => {
      const error = new RateLimitError('ElevenLabs', 60)
      
      expect(error.code).toBe('RATE_LIMIT_ERROR')
      expect(error.message).toBe('Rate limit exceeded for ElevenLabs')
      expect(error.statusCode).toBe(429)
      expect(error.details).toEqual({ retryAfter: 60 })
      expect(error.isRetryable).toBe(true)
      expect(error.category).toBe('EXTERNAL_SERVICE')
    })
  })

  describe('TimeoutError', () => {
    it('should create a TimeoutError with timeout information', () => {
      const error = new TimeoutError('API call', 5000)
      
      expect(error.code).toBe('TIMEOUT_ERROR')
      expect(error.message).toBe('Operation API call timed out after 5000ms')
      expect(error.statusCode).toBe(408)
      expect(error.details).toEqual({ timeoutMs: 5000 })
      expect(error.isRetryable).toBe(true)
    })
  })

  describe('CircuitBreakerError', () => {
    it('should create a CircuitBreakerError', () => {
      const error = new CircuitBreakerError('ElevenLabs')
      
      expect(error.code).toBe('CIRCUIT_BREAKER_OPEN')
      expect(error.message).toBe('Circuit breaker is open for ElevenLabs')
      expect(error.statusCode).toBe(503)
      expect(error.details).toEqual({ service: 'ElevenLabs' })
      expect(error.isRetryable).toBe(true)
    })
  })

  describe('BusinessLogicError', () => {
    it('should create a BusinessLogicError', () => {
      const error = new BusinessLogicError('Invalid workflow state', { state: 'invalid' })
      
      expect(error.code).toBe('BUSINESS_LOGIC_ERROR')
      expect(error.message).toBe('Invalid workflow state')
      expect(error.statusCode).toBe(422)
      expect(error.details).toEqual({ state: 'invalid' })
      expect(error.isRetryable).toBe(false)
      expect(error.category).toBe('BUSINESS_LOGIC')
    })
  })
})

describe('getErrorSeverity', () => {
  it('should return CRITICAL for 5xx errors', () => {
    const error = new AppError('TEST', 'Test', 500)
    expect(getErrorSeverity(error)).toBe('CRITICAL')
  })

  it('should return HIGH for non-retryable external service errors', () => {
    const error = new ExternalServiceError('Test', 'Error', {}, false)
    // Override status code to be 4xx for HIGH severity
    error.statusCode = 400
    expect(getErrorSeverity(error)).toBe('HIGH')
  })

  it('should return HIGH for database errors', () => {
    const error = new DatabaseError('Connection failed')
    // Override status code to be 4xx for HIGH severity
    error.statusCode = 400
    expect(getErrorSeverity(error)).toBe('HIGH')
  })

  it('should return MEDIUM for 4xx errors', () => {
    const error = new ValidationError('Invalid input')
    expect(getErrorSeverity(error)).toBe('MEDIUM')
  })

  it('should return LOW for other errors', () => {
    const error = new AppError('TEST', 'Test', 200)
    expect(getErrorSeverity(error)).toBe('LOW')
  })
})

describe('handleApiError', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should handle AppError correctly with enhanced response', () => {
    const error = new ValidationError('Invalid email format')
    const result = handleApiError(error, { taskId: 'task123' })
    
    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        message: 'Invalid email format',
        details: undefined,
        errorId: expect.stringMatching(/^err_\d+_[a-z0-9]+$/),
        isRetryable: false
      }),
      { status: 400 }
    )
  })

  it('should handle retryable errors', () => {
    const error = new ExternalServiceError('ElevenLabs', 'Rate limit exceeded', { retryAfter: 60 }, true)
    const result = handleApiError(error)
    
    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'EXTERNAL_SERVICE_ERROR',
        message: 'ElevenLabs: Rate limit exceeded',
        details: { retryAfter: 60 },
        isRetryable: true
      }),
      { status: 502 }
    )
  })

  it('should handle unknown errors with critical severity', () => {
    const error = new Error('Unknown error')
    const result = handleApiError(error, { taskId: 'task123' })
    
    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
        errorId: expect.stringMatching(/^err_\d+_[a-z0-9]+$/),
        isRetryable: false
      }),
      { status: 500 }
    )
  })
})

describe('withErrorHandling', () => {
  it('should wrap function and handle AppErrors', async () => {
    const mockHandler = jest.fn().mockRejectedValue(new ValidationError('Test error'))
    const wrappedHandler = withErrorHandling(mockHandler, { operation: 'test' })
    
    await expect(wrappedHandler()).rejects.toThrow(ValidationError)
    expect(mockHandler).toHaveBeenCalled()
  })

  it('should wrap unknown errors in AppError', async () => {
    const mockHandler = jest.fn().mockRejectedValue(new Error('Unknown error'))
    const wrappedHandler = withErrorHandling(mockHandler, { operation: 'test' })
    
    await expect(wrappedHandler()).rejects.toThrow(AppError)
    
    try {
      await wrappedHandler()
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe('INTERNAL_SERVER_ERROR')
      expect((error as AppError).message).toContain('Unexpected error in test')
    }
  })

  it('should return result on success', async () => {
    const mockHandler = jest.fn().mockResolvedValue('success')
    const wrappedHandler = withErrorHandling(mockHandler)
    
    const result = await wrappedHandler()
    expect(result).toBe('success')
  })
})