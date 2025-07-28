import { NextApiRequest, NextApiResponse } from 'next'
import { createHealthCheckHandler } from '@/lib/middleware'
import { circuitBreakerRegistry } from '@/lib/circuit-breaker'
import { databaseService } from '@/services/database'
import { elevenLabsService } from '@/services/elevenlabs'

// Health check functions
const healthChecks = {
  database: async (): Promise<boolean> => {
    try {
      // Test database connection
      await databaseService.testConnection()
      return true
    } catch {
      return false
    }
  },

  elevenlabs: async (): Promise<boolean> => {
    try {
      // Test ElevenLabs API connectivity
      return await elevenLabsService.validateApiKey()
    } catch {
      return false
    }
  },

  circuitBreakers: async (): Promise<boolean> => {
    try {
      // Check if any critical circuit breakers are open
      const health = circuitBreakerRegistry.getHealthStatus()
      const criticalServices = ['elevenlabs', 'database']
      
      for (const service of criticalServices) {
        if (health[service] && !health[service].healthy) {
          return false
        }
      }
      
      return true
    } catch {
      return false
    }
  },

  storage: async (): Promise<boolean> => {
    try {
      // Test Supabase storage connectivity
      // This would typically involve a simple storage operation
      return true // Placeholder - implement actual storage health check
    } catch {
      return false
    }
  }
}

export default createHealthCheckHandler(healthChecks)