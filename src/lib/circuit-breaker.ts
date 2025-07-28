import { logger } from './logger'
import { CircuitBreakerError } from './errors'

export interface CircuitBreakerConfig {
  failureThreshold: number
  recoveryTimeout: number
  monitoringPeriod: number
  expectedErrors?: string[]
}

export interface CircuitBreakerStats {
  state: CircuitBreakerState
  failureCount: number
  successCount: number
  totalRequests: number
  lastFailureTime?: Date
  nextAttemptTime?: Date
}

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

/**
 * Circuit Breaker implementation for external service calls
 * Prevents cascade failures by temporarily stopping calls to failing services
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = 'CLOSED'
  private failureCount = 0
  private successCount = 0
  private totalRequests = 0
  private lastFailureTime?: Date
  private nextAttemptTime?: Date
  private readonly config: CircuitBreakerConfig
  private readonly serviceName: string

  constructor(serviceName: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.serviceName = serviceName
    this.config = {
      failureThreshold: 5,
      recoveryTimeout: 60000, // 1 minute
      monitoringPeriod: 300000, // 5 minutes
      expectedErrors: [],
      ...config
    }

    logger.info('Circuit breaker initialized', {
      service: serviceName,
      config: this.config
    })
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>, operationName?: string): Promise<T> {
    const startTime = Date.now()
    
    if (this.state === 'OPEN') {
      if (this.shouldAttemptReset()) {
        this.state = 'HALF_OPEN'
        logger.info('Circuit breaker transitioning to HALF_OPEN', {
          service: this.serviceName,
          operation: operationName
        })
      } else {
        logger.warn('Circuit breaker is OPEN, rejecting request', {
          service: this.serviceName,
          operation: operationName,
          nextAttemptTime: this.nextAttemptTime
        })
        throw new CircuitBreakerError(this.serviceName)
      }
    }

    this.totalRequests++

    try {
      const result = await operation()
      this.onSuccess(operationName, Date.now() - startTime)
      return result
    } catch (error) {
      this.onFailure(error, operationName, Date.now() - startTime)
      throw error
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(operationName?: string, duration?: number): void {
    this.successCount++
    
    if (this.state === 'HALF_OPEN') {
      this.reset()
      logger.info('Circuit breaker reset to CLOSED after successful call', {
        service: this.serviceName,
        operation: operationName,
        duration
      })
    }

    logger.debug('Circuit breaker success', {
      service: this.serviceName,
      operation: operationName,
      duration,
      state: this.state,
      successCount: this.successCount
    })
  }

  /**
   * Handle failed operation
   */
  private onFailure(error: unknown, operationName?: string, duration?: number): void {
    // Check if this is an expected error that shouldn't count as failure
    if (this.isExpectedError(error)) {
      logger.debug('Circuit breaker ignoring expected error', {
        service: this.serviceName,
        operation: operationName,
        error: error instanceof Error ? error.message : String(error)
      })
      return
    }

    this.failureCount++
    this.lastFailureTime = new Date()

    logger.warn('Circuit breaker failure recorded', {
      service: this.serviceName,
      operation: operationName,
      duration,
      failureCount: this.failureCount,
      threshold: this.config.failureThreshold,
      error: error instanceof Error ? error.message : String(error)
    })

    if (this.state === 'HALF_OPEN') {
      this.trip()
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.trip()
    }
  }

  /**
   * Check if error should be ignored by circuit breaker
   */
  private isExpectedError(error: unknown): boolean {
    if (!this.config.expectedErrors?.length) {
      return false
    }

    const errorMessage = error instanceof Error ? error.message : String(error)
    return this.config.expectedErrors.some(expectedError => 
      errorMessage.includes(expectedError)
    )
  }

  /**
   * Trip the circuit breaker to OPEN state
   */
  private trip(): void {
    this.state = 'OPEN'
    this.nextAttemptTime = new Date(Date.now() + this.config.recoveryTimeout)
    
    logger.error('Circuit breaker TRIPPED to OPEN state', undefined, {
      service: this.serviceName,
      failureCount: this.failureCount,
      threshold: this.config.failureThreshold,
      nextAttemptTime: this.nextAttemptTime,
      recoveryTimeout: this.config.recoveryTimeout
    })
  }

  /**
   * Reset circuit breaker to CLOSED state
   */
  private reset(): void {
    this.state = 'CLOSED'
    this.failureCount = 0
    this.nextAttemptTime = undefined
  }

  /**
   * Check if we should attempt to reset the circuit breaker
   */
  private shouldAttemptReset(): boolean {
    return this.nextAttemptTime ? Date.now() >= this.nextAttemptTime.getTime() : false
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      totalRequests: this.totalRequests,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime
    }
  }

  /**
   * Force reset the circuit breaker (for testing or manual intervention)
   */
  forceReset(): void {
    logger.info('Circuit breaker force reset', {
      service: this.serviceName,
      previousState: this.state,
      failureCount: this.failureCount
    })
    
    this.reset()
  }

  /**
   * Get health status for monitoring
   */
  getHealthStatus(): { healthy: boolean; state: CircuitBreakerState; details: any } {
    const stats = this.getStats()
    return {
      healthy: this.state === 'CLOSED',
      state: this.state,
      details: {
        failureCount: stats.failureCount,
        successCount: stats.successCount,
        totalRequests: stats.totalRequests,
        failureRate: stats.totalRequests > 0 ? stats.failureCount / stats.totalRequests : 0,
        lastFailureTime: stats.lastFailureTime,
        nextAttemptTime: stats.nextAttemptTime
      }
    }
  }
}

/**
 * Circuit breaker registry for managing multiple service breakers
 */
export class CircuitBreakerRegistry {
  private static instance: CircuitBreakerRegistry
  private breakers: Map<string, CircuitBreaker> = new Map()

  static getInstance(): CircuitBreakerRegistry {
    if (!CircuitBreakerRegistry.instance) {
      CircuitBreakerRegistry.instance = new CircuitBreakerRegistry()
    }
    return CircuitBreakerRegistry.instance
  }

  getOrCreate(serviceName: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.breakers.has(serviceName)) {
      this.breakers.set(serviceName, new CircuitBreaker(serviceName, config))
    }
    return this.breakers.get(serviceName)!
  }

  get(serviceName: string): CircuitBreaker | undefined {
    return this.breakers.get(serviceName)
  }

  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {}
    this.breakers.forEach((breaker, serviceName) => {
      stats[serviceName] = breaker.getStats()
    })
    return stats
  }

  getHealthStatus(): Record<string, any> {
    const health: Record<string, any> = {}
    this.breakers.forEach((breaker, serviceName) => {
      health[serviceName] = breaker.getHealthStatus()
    })
    return health
  }
}

// Export singleton instance
export const circuitBreakerRegistry = CircuitBreakerRegistry.getInstance()