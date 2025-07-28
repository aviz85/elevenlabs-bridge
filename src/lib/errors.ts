import { NextResponse } from 'next/server'
import { ApiError } from '@/types'
import { logger } from './logger'

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: any,
    public isRetryable: boolean = false,
    public category: ErrorCategory = 'SYSTEM'
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export type ErrorCategory = 'VALIDATION' | 'AUTHENTICATION' | 'AUTHORIZATION' | 'EXTERNAL_SERVICE' | 'DATABASE' | 'SYSTEM' | 'BUSINESS_LOGIC'

export type ErrorSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super('VALIDATION_ERROR', message, 400, details, false, 'VALIDATION')
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed', details?: any) {
    super('AUTHENTICATION_ERROR', message, 401, details, false, 'AUTHENTICATION')
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied', details?: any) {
    super('AUTHORIZATION_ERROR', message, 403, details, false, 'AUTHORIZATION')
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} not found`, 404, undefined, false, 'VALIDATION')
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, details?: any, isRetryable: boolean = true) {
    super('EXTERNAL_SERVICE_ERROR', `${service}: ${message}`, 502, details, isRetryable, 'EXTERNAL_SERVICE')
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details?: any, isRetryable: boolean = true) {
    super('DATABASE_ERROR', message, 500, details, isRetryable, 'DATABASE')
  }
}

export class RateLimitError extends AppError {
  constructor(service: string, retryAfter?: number) {
    super('RATE_LIMIT_ERROR', `Rate limit exceeded for ${service}`, 429, { retryAfter }, true, 'EXTERNAL_SERVICE')
  }
}

export class TimeoutError extends AppError {
  constructor(operation: string, timeoutMs: number) {
    super('TIMEOUT_ERROR', `Operation ${operation} timed out after ${timeoutMs}ms`, 408, { timeoutMs }, true, 'SYSTEM')
  }
}

export class CircuitBreakerError extends AppError {
  constructor(service: string) {
    super('CIRCUIT_BREAKER_OPEN', `Circuit breaker is open for ${service}`, 503, { service }, true, 'EXTERNAL_SERVICE')
  }
}

export class BusinessLogicError extends AppError {
  constructor(message: string, details?: any) {
    super('BUSINESS_LOGIC_ERROR', message, 422, details, false, 'BUSINESS_LOGIC')
  }
}

/**
 * Determines error severity based on error type and context
 */
export function getErrorSeverity(error: AppError): ErrorSeverity {
  // Critical errors: 5xx status codes
  if (error.statusCode >= 500) return 'CRITICAL'
  
  // High severity: non-retryable external service errors or database errors with 4xx codes
  if (error.category === 'EXTERNAL_SERVICE' && !error.isRetryable && error.statusCode < 500) return 'HIGH'
  if (error.category === 'DATABASE' && error.statusCode < 500) return 'HIGH'
  
  // Medium severity: 4xx errors
  if (error.statusCode >= 400) return 'MEDIUM'
  
  return 'LOW'
}

/**
 * Enhanced error handler with monitoring and alerting
 */
export function handleApiError(error: unknown, context?: { taskId?: string; segmentId?: string; userId?: string }): NextResponse<ApiError> {
  const errorId = generateErrorId()
  
  if (error instanceof AppError) {
    const severity = getErrorSeverity(error)
    
    logger.error('API Error occurred', error, {
      ...context,
      errorId,
      errorCode: error.code,
      errorCategory: error.category,
      severity,
      isRetryable: error.isRetryable,
      statusCode: error.statusCode
    })

    // Send alerts for critical errors
    if (severity === 'CRITICAL') {
      sendCriticalErrorAlert(error, errorId, context)
    }

    return NextResponse.json(
      {
        code: error.code,
        message: error.message,
        details: error.details,
        errorId,
        isRetryable: error.isRetryable
      },
      { status: error.statusCode }
    )
  }

  // Handle unknown errors
  const unknownError = error instanceof Error ? error : new Error(String(error))
  
  logger.error('Unexpected error occurred', unknownError, {
    ...context,
    errorId,
    errorCode: 'INTERNAL_SERVER_ERROR',
    errorCategory: 'SYSTEM',
    severity: 'CRITICAL'
  })

  // Always alert on unexpected errors
  sendCriticalErrorAlert(unknownError, errorId, context)

  return NextResponse.json(
    {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      errorId,
      isRetryable: false
    },
    { status: 500 }
  )
}

/**
 * Generate unique error ID for tracking
 */
function generateErrorId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Send critical error alerts (placeholder for monitoring integration)
 */
function sendCriticalErrorAlert(error: Error, errorId: string, context?: any): void {
  // In production, this would integrate with monitoring services like:
  // - Sentry
  // - DataDog
  // - New Relic
  // - Custom webhook notifications
  
  logger.error('CRITICAL ERROR ALERT', error, {
    ...context,
    errorId,
    alertType: 'CRITICAL_ERROR',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  })

  // Example webhook notification (commented out for now)
  /*
  if (process.env.ALERT_WEBHOOK_URL) {
    fetch(process.env.ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        errorId,
        message: error.message,
        stack: error.stack,
        context,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV
      })
    }).catch(alertError => {
      logger.error('Failed to send alert webhook', alertError)
    })
  }
  */
}

/**
 * Middleware for centralized error handling in API routes
 */
export function withErrorHandling<T extends any[], R>(
  handler: (...args: T) => Promise<R>,
  context?: { operation?: string; taskId?: string; segmentId?: string }
) {
  return async (...args: T): Promise<R> => {
    try {
      return await handler(...args)
    } catch (error) {
      // Re-throw AppErrors to be handled by the API route
      if (error instanceof AppError) {
        throw error
      }
      
      // Wrap unknown errors
      const wrappedError = new AppError(
        'INTERNAL_SERVER_ERROR',
        `Unexpected error in ${context?.operation || 'operation'}: ${error instanceof Error ? error.message : String(error)}`,
        500,
        { originalError: error instanceof Error ? error.message : String(error) },
        false,
        'SYSTEM'
      )
      
      throw wrappedError
    }
  }
}