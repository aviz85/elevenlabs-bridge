import { NextResponse } from 'next/server'
import {
  AppError,
  ValidationError,
  NotFoundError,
  ExternalServiceError,
  DatabaseError,
  handleApiError
} from '../errors'

// Mock NextResponse
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, options) => ({ data, options }))
  }
}))

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create an AppError with correct properties', () => {
      const error = new AppError('TEST_ERROR', 'Test message', 400, { detail: 'test' })
      
      expect(error.name).toBe('AppError')
      expect(error.code).toBe('TEST_ERROR')
      expect(error.message).toBe('Test message')
      expect(error.statusCode).toBe(400)
      expect(error.details).toEqual({ detail: 'test' })
    })

    it('should default to status code 500', () => {
      const error = new AppError('TEST_ERROR', 'Test message')
      expect(error.statusCode).toBe(500)
    })
  })

  describe('ValidationError', () => {
    it('should create a ValidationError with 400 status code', () => {
      const error = new ValidationError('Invalid input', { field: 'email' })
      
      expect(error.code).toBe('VALIDATION_ERROR')
      expect(error.message).toBe('Invalid input')
      expect(error.statusCode).toBe(400)
      expect(error.details).toEqual({ field: 'email' })
    })
  })

  describe('NotFoundError', () => {
    it('should create a NotFoundError with 404 status code', () => {
      const error = new NotFoundError('User')
      
      expect(error.code).toBe('NOT_FOUND')
      expect(error.message).toBe('User not found')
      expect(error.statusCode).toBe(404)
    })
  })

  describe('ExternalServiceError', () => {
    it('should create an ExternalServiceError with 502 status code', () => {
      const error = new ExternalServiceError('ElevenLabs', 'API timeout', { timeout: 30000 })
      
      expect(error.code).toBe('EXTERNAL_SERVICE_ERROR')
      expect(error.message).toBe('ElevenLabs: API timeout')
      expect(error.statusCode).toBe(502)
      expect(error.details).toEqual({ timeout: 30000 })
    })
  })

  describe('DatabaseError', () => {
    it('should create a DatabaseError with 500 status code', () => {
      const error = new DatabaseError('Connection failed', { host: 'localhost' })
      
      expect(error.code).toBe('DATABASE_ERROR')
      expect(error.message).toBe('Connection failed')
      expect(error.statusCode).toBe(500)
      expect(error.details).toEqual({ host: 'localhost' })
    })
  })
})

describe('handleApiError', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should handle AppError correctly', () => {
    const error = new ValidationError('Invalid email format')
    const result = handleApiError(error)
    
    expect(NextResponse.json).toHaveBeenCalledWith(
      {
        code: 'VALIDATION_ERROR',
        message: 'Invalid email format',
        details: undefined
      },
      { status: 400 }
    )
  })

  it('should handle AppError with details', () => {
    const error = new ExternalServiceError('ElevenLabs', 'Rate limit exceeded', { retryAfter: 60 })
    const result = handleApiError(error)
    
    expect(NextResponse.json).toHaveBeenCalledWith(
      {
        code: 'EXTERNAL_SERVICE_ERROR',
        message: 'ElevenLabs: Rate limit exceeded',
        details: { retryAfter: 60 }
      },
      { status: 502 }
    )
  })

  it('should handle unknown Error objects', () => {
    const error = new Error('Unknown error')
    const result = handleApiError(error)
    
    expect(NextResponse.json).toHaveBeenCalledWith(
      {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred'
      },
      { status: 500 }
    )
  })

  it('should handle non-Error objects', () => {
    const error = 'String error'
    const result = handleApiError(error)
    
    expect(NextResponse.json).toHaveBeenCalledWith(
      {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred'
      },
      { status: 500 }
    )
  })

  it('should handle null/undefined errors', () => {
    const result = handleApiError(null)
    
    expect(NextResponse.json).toHaveBeenCalledWith(
      {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred'
      },
      { status: 500 }
    )
  })
})