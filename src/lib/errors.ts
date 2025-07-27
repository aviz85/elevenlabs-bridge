import { NextResponse } from 'next/server'
import { ApiError } from '@/types'
import { logger } from './logger'

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super('VALIDATION_ERROR', message, 400, details)
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} not found`, 404)
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string, details?: any) {
    super('EXTERNAL_SERVICE_ERROR', `${service}: ${message}`, 502, details)
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details?: any) {
    super('DATABASE_ERROR', message, 500, details)
  }
}

export function handleApiError(error: unknown): NextResponse<ApiError> {
  logger.error('API Error occurred', error instanceof Error ? error : new Error(String(error)))

  if (error instanceof AppError) {
    return NextResponse.json(
      {
        code: error.code,
        message: error.message,
        details: error.details
      },
      { status: error.statusCode }
    )
  }

  // Handle unknown errors
  return NextResponse.json(
    {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred'
    },
    { status: 500 }
  )
}