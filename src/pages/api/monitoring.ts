import { NextApiRequest, NextApiResponse } from 'next'
import { withErrorHandling, withMethodValidation, compose } from '@/lib/middleware'
import { circuitBreakerRegistry } from '@/lib/circuit-breaker'
import { logger } from '@/lib/logger'

const handler = compose(
  withMethodValidation(['GET'])
)(async (req, res, context) => {
  logger.info('Monitoring endpoint accessed', context)

  // Get circuit breaker statistics
  const circuitBreakerStats = circuitBreakerRegistry.getAllStats()
  const circuitBreakerHealth = circuitBreakerRegistry.getHealthStatus()

  // System information
  const systemInfo = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    platform: process.platform,
    nodeVersion: process.version
  }

  // Service health summary
  const serviceHealth = {
    overall: Object.values(circuitBreakerHealth).every(service => service.healthy),
    services: circuitBreakerHealth
  }

  // Performance metrics (placeholder - in production, integrate with APM)
  const performanceMetrics = {
    averageResponseTime: 150, // ms
    requestsPerMinute: 45,
    errorRate: 0.02, // 2%
    activeConnections: 12
  }

  // Error summary (placeholder - in production, integrate with error tracking)
  const errorSummary = {
    last24Hours: {
      total: 23,
      critical: 2,
      high: 5,
      medium: 12,
      low: 4
    },
    topErrors: [
      { code: 'EXTERNAL_SERVICE_ERROR', count: 8, service: 'ElevenLabs' },
      { code: 'VALIDATION_ERROR', count: 7, service: 'API' },
      { code: 'TIMEOUT_ERROR', count: 5, service: 'Database' }
    ]
  }

  const response = {
    status: 'ok',
    system: systemInfo,
    health: serviceHealth,
    circuitBreakers: {
      stats: circuitBreakerStats,
      health: circuitBreakerHealth
    },
    performance: performanceMetrics,
    errors: errorSummary
  }

  res.status(200).json(response)
})

export default withErrorHandling(handler, { operation: 'monitoring' })