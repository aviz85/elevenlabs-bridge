import { CircuitBreaker, CircuitBreakerRegistry, circuitBreakerRegistry } from '../circuit-breaker'
import { CircuitBreakerError } from '../errors'

// Mock logger
jest.mock('../logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}))

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker('test-service', {
      failureThreshold: 3,
      recoveryTimeout: 1000,
      monitoringPeriod: 5000
    })
  })

  describe('execute', () => {
    it('should execute operation successfully when circuit is closed', async () => {
      const operation = jest.fn().mockResolvedValue('success')
      
      const result = await circuitBreaker.execute(operation)
      
      expect(result).toBe('success')
      expect(operation).toHaveBeenCalled()
      
      const stats = circuitBreaker.getStats()
      expect(stats.state).toBe('CLOSED')
      expect(stats.successCount).toBe(1)
      expect(stats.failureCount).toBe(0)
    })

    it('should record failures and trip circuit breaker', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Service error'))
      
      // First two failures should not trip the circuit
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Service error')
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Service error')
      
      let stats = circuitBreaker.getStats()
      expect(stats.state).toBe('CLOSED')
      expect(stats.failureCount).toBe(2)
      
      // Third failure should trip the circuit
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Service error')
      
      stats = circuitBreaker.getStats()
      expect(stats.state).toBe('OPEN')
      expect(stats.failureCount).toBe(3)
    })

    it('should reject requests when circuit is open', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Service error'))
      
      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(operation)).rejects.toThrow('Service error')
      }
      
      // Now circuit should be open and reject requests
      await expect(circuitBreaker.execute(operation)).rejects.toThrow(CircuitBreakerError)
      
      // Operation should not be called when circuit is open
      expect(operation).toHaveBeenCalledTimes(3)
    })

    it('should transition to half-open after recovery timeout', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Service error'))
        .mockRejectedValueOnce(new Error('Service error'))
        .mockRejectedValueOnce(new Error('Service error'))
        .mockResolvedValueOnce('success')
      
      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(operation)).rejects.toThrow('Service error')
      }
      
      expect(circuitBreaker.getStats().state).toBe('OPEN')
      
      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 1100))
      
      // Next call should transition to half-open and succeed
      const result = await circuitBreaker.execute(operation)
      expect(result).toBe('success')
      expect(circuitBreaker.getStats().state).toBe('CLOSED')
    })

    it('should trip again if half-open call fails', async () => {
      const operation = jest.fn()
        .mockRejectedValue(new Error('Service error'))
      
      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(operation)).rejects.toThrow('Service error')
      }
      
      // Wait for recovery timeout
      await new Promise(resolve => setTimeout(resolve, 1100))
      
      // Half-open call fails, should trip again
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Service error')
      expect(circuitBreaker.getStats().state).toBe('OPEN')
    })

    it('should ignore expected errors', async () => {
      const circuitBreakerWithExpected = new CircuitBreaker('test-service', {
        failureThreshold: 3,
        expectedErrors: ['Expected error']
      })
      
      const operation = jest.fn().mockRejectedValue(new Error('Expected error'))
      
      // Expected errors should not count towards failure threshold
      for (let i = 0; i < 5; i++) {
        await expect(circuitBreakerWithExpected.execute(operation)).rejects.toThrow('Expected error')
      }
      
      expect(circuitBreakerWithExpected.getStats().state).toBe('CLOSED')
      expect(circuitBreakerWithExpected.getStats().failureCount).toBe(0)
    })
  })

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const stats = circuitBreaker.getStats()
      
      expect(stats).toEqual({
        state: 'CLOSED',
        failureCount: 0,
        successCount: 0,
        totalRequests: 0,
        lastFailureTime: undefined,
        nextAttemptTime: undefined
      })
    })
  })

  describe('getHealthStatus', () => {
    it('should return healthy status when closed', () => {
      const health = circuitBreaker.getHealthStatus()
      
      expect(health.healthy).toBe(true)
      expect(health.state).toBe('CLOSED')
      expect(health.details.failureRate).toBe(0)
    })

    it('should return unhealthy status when open', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Service error'))
      
      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(operation)).rejects.toThrow('Service error')
      }
      
      const health = circuitBreaker.getHealthStatus()
      
      expect(health.healthy).toBe(false)
      expect(health.state).toBe('OPEN')
      expect(health.details.failureRate).toBe(1)
    })
  })

  describe('forceReset', () => {
    it('should reset circuit breaker state', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Service error'))
      
      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(operation)).rejects.toThrow('Service error')
      }
      
      expect(circuitBreaker.getStats().state).toBe('OPEN')
      
      circuitBreaker.forceReset()
      
      const stats = circuitBreaker.getStats()
      expect(stats.state).toBe('CLOSED')
      expect(stats.failureCount).toBe(0)
      expect(stats.nextAttemptTime).toBeUndefined()
    })
  })
})

describe('CircuitBreakerRegistry', () => {
  let registry: CircuitBreakerRegistry

  beforeEach(() => {
    registry = new CircuitBreakerRegistry()
  })

  describe('getOrCreate', () => {
    it('should create new circuit breaker if not exists', () => {
      const breaker = registry.getOrCreate('service1')
      
      expect(breaker).toBeInstanceOf(CircuitBreaker)
      expect(registry.get('service1')).toBe(breaker)
    })

    it('should return existing circuit breaker', () => {
      const breaker1 = registry.getOrCreate('service1')
      const breaker2 = registry.getOrCreate('service1')
      
      expect(breaker1).toBe(breaker2)
    })

    it('should create circuit breaker with custom config', () => {
      const breaker = registry.getOrCreate('service1', { failureThreshold: 10 })
      
      expect(breaker).toBeInstanceOf(CircuitBreaker)
    })
  })

  describe('getAllStats', () => {
    it('should return stats for all circuit breakers', () => {
      registry.getOrCreate('service1')
      registry.getOrCreate('service2')
      
      const stats = registry.getAllStats()
      
      expect(Object.keys(stats)).toEqual(['service1', 'service2'])
      expect(stats.service1.state).toBe('CLOSED')
      expect(stats.service2.state).toBe('CLOSED')
    })
  })

  describe('getHealthStatus', () => {
    it('should return health status for all circuit breakers', () => {
      registry.getOrCreate('service1')
      registry.getOrCreate('service2')
      
      const health = registry.getHealthStatus()
      
      expect(Object.keys(health)).toEqual(['service1', 'service2'])
      expect(health.service1.healthy).toBe(true)
      expect(health.service2.healthy).toBe(true)
    })
  })
})

describe('circuitBreakerRegistry singleton', () => {
  it('should return the same instance', () => {
    const instance1 = CircuitBreakerRegistry.getInstance()
    const instance2 = CircuitBreakerRegistry.getInstance()
    
    expect(instance1).toBe(instance2)
    expect(instance1).toBe(circuitBreakerRegistry)
  })
})