type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  taskId?: string
  segmentId?: string
  userId?: string
  operation?: string
  duration?: number
  statusCode?: number
  errorId?: string
  errorCode?: string
  errorCategory?: string
  severity?: string
  isRetryable?: boolean
  [key: string]: any
}

interface StructuredLogEntry {
  timestamp: string
  level: LogLevel
  message: string
  context?: LogContext
  error?: {
    message: string
    stack?: string
    name?: string
  }
  environment: string
  service: string
  version?: string
}

export class Logger {
  private get isDevelopment() { return process.env.NODE_ENV === 'development' }
  private get isProduction() { return process.env.NODE_ENV === 'production' }
  private service = 'elevenlabs-proxy-server'
  private version = process.env.npm_package_version || '1.0.0'

  private createStructuredLog(level: LogLevel, message: string, error?: Error, context?: LogContext): StructuredLogEntry {
    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      environment: process.env.NODE_ENV || 'development',
      service: this.service,
      version: this.version
    }

    if (context) {
      entry.context = context
    }

    if (error) {
      entry.error = {
        message: error.message,
        stack: error.stack,
        name: error.name
      }
    }

    return entry
  }

  private formatMessage(entry: StructuredLogEntry): string {
    if (this.isProduction) {
      // In production, output structured JSON logs
      return JSON.stringify(entry)
    } else {
      // In development, use human-readable format
      const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : ''
      const errorStr = entry.error ? ` ERROR: ${entry.error.message}` : ''
      return `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}${contextStr}${errorStr}`
    }
  }

  private writeLog(entry: StructuredLogEntry): void {
    const formatted = this.formatMessage(entry)
    
    switch (entry.level) {
      case 'debug':
        if (this.isDevelopment) {
          console.debug(formatted)
        }
        break
      case 'info':
        console.info(formatted)
        break
      case 'warn':
        console.warn(formatted)
        break
      case 'error':
        console.error(formatted)
        // In production, also send to error tracking service
        if (this.isProduction) {
          this.sendToErrorTracking(entry)
        }
        break
    }
  }

  private sendToErrorTracking(entry: StructuredLogEntry): void {
    // Placeholder for error tracking integration
    // In production, this would send to services like Sentry, DataDog, etc.
    
    // Example Sentry integration (commented out):
    /*
    if (typeof window !== 'undefined' && window.Sentry) {
      window.Sentry.captureException(new Error(entry.message), {
        level: entry.level as any,
        contexts: {
          custom: entry.context
        },
        extra: entry.error
      })
    }
    */
  }

  debug(message: string, context?: LogContext): void {
    const entry = this.createStructuredLog('debug', message, undefined, context)
    this.writeLog(entry)
  }

  info(message: string, context?: LogContext): void {
    const entry = this.createStructuredLog('info', message, undefined, context)
    this.writeLog(entry)
  }

  warn(message: string, context?: LogContext): void {
    const entry = this.createStructuredLog('warn', message, undefined, context)
    this.writeLog(entry)
  }

  error(message: string, error?: Error, context?: LogContext): void {
    const entry = this.createStructuredLog('error', message, error, context)
    this.writeLog(entry)
  }

  /**
   * Log performance metrics
   */
  performance(operation: string, duration: number, context?: LogContext): void {
    this.info(`Performance: ${operation}`, {
      ...context,
      operation,
      duration,
      metric: 'performance'
    })
  }

  /**
   * Log API requests
   */
  apiRequest(method: string, path: string, statusCode: number, duration: number, context?: LogContext): void {
    const level = statusCode >= 400 ? 'warn' : 'info'
    const entry = this.createStructuredLog(level, `API ${method} ${path}`, undefined, {
      ...context,
      method,
      path,
      statusCode,
      duration,
      metric: 'api_request'
    })
    this.writeLog(entry)
  }

  /**
   * Log external service calls
   */
  externalService(service: string, operation: string, success: boolean, duration: number, context?: LogContext): void {
    const level = success ? 'info' : 'warn'
    const entry = this.createStructuredLog(level, `External service: ${service}.${operation}`, undefined, {
      ...context,
      service,
      operation,
      success,
      duration,
      metric: 'external_service'
    })
    this.writeLog(entry)
  }

  /**
   * Log business events
   */
  businessEvent(event: string, context?: LogContext): void {
    this.info(`Business event: ${event}`, {
      ...context,
      event,
      metric: 'business_event'
    })
  }
}

export const logger = new Logger()