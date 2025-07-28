import { NextApiRequest, NextApiResponse } from 'next'
import { circuitBreakerRegistry } from '@/lib/circuit-breaker'
import { logger } from '@/lib/logger'

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { service } = req.body

    if (!service) {
      return res.status(400).json({ 
        error: 'Missing service name',
        availableServices: ['elevenlabs']
      })
    }

    const circuitBreaker = circuitBreakerRegistry.get(service)
    
    if (!circuitBreaker) {
      return res.status(404).json({ 
        error: `Circuit breaker not found for service: ${service}`,
        availableServices: Object.keys(circuitBreakerRegistry.getAllStats())
      })
    }

    // Get stats before reset
    const statsBefore = circuitBreaker.getStats()
    
    // Force reset
    circuitBreaker.forceReset()
    
    // Get stats after reset
    const statsAfter = circuitBreaker.getStats()

    logger.info('Circuit breaker manually reset', {
      service,
      statsBefore,
      statsAfter,
      resetBy: 'manual-api'
    })

    res.status(200).json({
      message: `Circuit breaker reset successfully for ${service}`,
      service,
      before: statsBefore,
      after: statsAfter,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    logger.error('Failed to reset circuit breaker', error as Error)
    
    res.status(500).json({
      error: 'Failed to reset circuit breaker',
      message: (error as Error).message
    })
  }
} 