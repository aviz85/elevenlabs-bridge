import { NextApiRequest, NextApiResponse } from 'next'
import { logger } from './logger'
import { handleApiError, AppError } from './errors'

export interface ApiContext {
  taskId?: string
  segmentId?: string
  userId?: string
  operation?: string
}

export type ApiHandler<T = any> = (
  req: NextApiRequest,
  res: NextApiResponse<T>,
  context: ApiContext
) => Promise<void>

/**
 * Centralized error handling middleware for API routes
 */
export function withErrorHandling<T = any>(
  handler: ApiHandler<T>,
  options: {
    operation?: string
    extractContext?: (req: NextApiRequest) => ApiContext
  } = {}
) {
  return async (req: NextApiRequest, res: NextApiResponse<T>) => {
    const startTime = Date.now()
    const operation = options.operation || `${req.method} ${req.url}`
    
    // Extract context from request
    const baseContext: ApiContext = {
      operation,
      taskId: req.query.taskId as string,
      segmentId: req.query.segmentId as string,
      userId: req.headers['x-user-id'] as string
    }
    
    const context = options.extractContext 
      ? { ...baseContext, ...options.extractContext(req) }
      : baseContext

    try {
      logger.info('API request started', {
        ...context,
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
        contentType: req.headers['content-type']
      })

      await handler(req, res, context)

      const duration = Date.now() - startTime
      const statusCode = res.statusCode

      logger.apiRequest(
        req.method || 'UNKNOWN',
        req.url || '',
        statusCode,
        duration,
        context
      )

    } catch (error) {
      const duration = Date.now() - startTime
      
      logger.error('API request failed', error as Error, {
        ...context,
        duration,
        method: req.method,
        url: req.url
      })

      const errorResponse = handleApiError(error, context)
      
      // Extract response data and status from NextResponse
      const responseData = await errorResponse.json()
      const status = errorResponse.status

      res.status(status).json(responseData)
    }
  }
}

/**
 * Middleware for validating request methods
 */
export function withMethodValidation(allowedMethods: string[]) {
  return function<T>(handler: ApiHandler<T>): ApiHandler<T> {
    return async (req, res, context) => {
      if (!req.method || !allowedMethods.includes(req.method)) {
        throw new AppError(
          'METHOD_NOT_ALLOWED',
          `Method ${req.method} not allowed. Allowed methods: ${allowedMethods.join(', ')}`,
          405,
          { allowedMethods, requestedMethod: req.method }
        )
      }
      
      return handler(req, res, context)
    }
  }
}

/**
 * Middleware for request rate limiting
 */
export function withRateLimit(options: {
  windowMs: number
  maxRequests: number
  keyGenerator?: (req: NextApiRequest) => string
}) {
  const requests = new Map<string, { count: number; resetTime: number }>()
  
  return function<T>(handler: ApiHandler<T>): ApiHandler<T> {
    return async (req, res, context) => {
      const key = options.keyGenerator 
        ? options.keyGenerator(req)
        : req.headers['x-forwarded-for'] as string || (req as any).connection?.remoteAddress || req.socket?.remoteAddress || 'unknown'
      
      const now = Date.now()
      const windowStart = now - options.windowMs
      
      // Clean up old entries
      for (const [k, v] of requests.entries()) {
        if (v.resetTime < windowStart) {
          requests.delete(k)
        }
      }
      
      const current = requests.get(key) || { count: 0, resetTime: now + options.windowMs }
      
      if (current.count >= options.maxRequests && current.resetTime > now) {
        const retryAfter = Math.ceil((current.resetTime - now) / 1000)
        
        logger.warn('Rate limit exceeded', {
          ...context,
          key,
          count: current.count,
          maxRequests: options.maxRequests,
          retryAfter
        })
        
        res.setHeader('Retry-After', retryAfter.toString())
        throw new AppError(
          'RATE_LIMIT_EXCEEDED',
          'Too many requests',
          429,
          { retryAfter }
        )
      }
      
      current.count++
      requests.set(key, current)
      
      return handler(req, res, context)
    }
  }
}

/**
 * Middleware for request timeout handling
 */
export function withTimeout(timeoutMs: number) {
  return function<T>(handler: ApiHandler<T>): ApiHandler<T> {
    return async (req, res, context) => {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new AppError(
            'REQUEST_TIMEOUT',
            `Request timed out after ${timeoutMs}ms`,
            408,
            { timeoutMs }
          ))
        }, timeoutMs)
      })
      
      return Promise.race([
        handler(req, res, context),
        timeoutPromise
      ])
    }
  }
}

/**
 * Middleware for request validation
 */
export function withValidation<T>(
  validator: (req: NextApiRequest) => void | Promise<void>
) {
  return function(handler: ApiHandler<T>): ApiHandler<T> {
    return async (req, res, context) => {
      await validator(req)
      return handler(req, res, context)
    }
  }
}

/**
 * Compose multiple middleware functions
 */
export function compose<T>(...middlewares: Array<(handler: ApiHandler<T>) => ApiHandler<T>>) {
  return function(handler: ApiHandler<T>): ApiHandler<T> {
    return middlewares.reduceRight((acc, middleware) => middleware(acc), handler)
  }
}

/**
 * Health check middleware
 */
export function createHealthCheckHandler(checks: Record<string, () => Promise<boolean>>) {
  return withErrorHandling(async (req, res, context) => {
    const results: Record<string, { healthy: boolean; error?: string; duration: number }> = {}
    let overallHealthy = true
    
    for (const [name, check] of Object.entries(checks)) {
      const startTime = Date.now()
      try {
        const healthy = await check()
        results[name] = { healthy, duration: Date.now() - startTime }
        if (!healthy) overallHealthy = false
      } catch (error) {
        results[name] = {
          healthy: false,
          error: error instanceof Error ? error.message : String(error),
          duration: Date.now() - startTime
        }
        overallHealthy = false
      }
    }
    
    const response = {
      healthy: overallHealthy,
      timestamp: new Date().toISOString(),
      checks: results
    }
    
    res.status(overallHealthy ? 200 : 503).json(response)
  }, { operation: 'health-check' })
}