import { NextApiRequest, NextApiResponse } from 'next'
import { queueManager } from '@/services/queue-manager'
import { withErrorHandling, withMethodValidation, compose } from '@/lib/middleware'
import { logger } from '@/lib/logger'

const handler = compose(
  withMethodValidation(['POST', 'GET']) // Allow both POST and GET for cron jobs
)(async (req, res, context) => {
  logger.info('Queue processing triggered', {
    method: req.method,
    userAgent: req.headers['user-agent'],
    isCron: req.headers['user-agent']?.includes('vercel-cron')
  })

  const result = await queueManager.forceProcessQueue()
  
  logger.info('Queue processing completed', {
    processedJobs: result.processedJobs,
    remainingJobs: result.remainingJobs
  })

  // 🚀 AUTO-TRIGGER ADDITIONAL PROCESSING IF NEEDED
  if (result.remainingJobs > 0) {
    logger.info('Jobs remaining - scheduling additional processing', {
      remainingJobs: result.remainingJobs
    })
    
    // Trigger another round in 30 seconds if there are remaining jobs
    setTimeout(async () => {
      try {
        logger.info('Auto-retry processing remaining jobs')
        await queueManager.forceProcessQueue()
      } catch (error) {
        logger.error('Auto-retry queue processing failed', error as Error)
      }
    }, 30000)
  }

  res.status(200).json({
    success: true,
    message: 'Queue processing triggered successfully',
    processedJobs: result.processedJobs,
    remainingJobs: result.remainingJobs,
    autoRetryScheduled: result.remainingJobs > 0
  })
})

export default withErrorHandling(handler, { 
  operation: 'process-queue',
  extractContext: (req) => ({
    operation: 'process-queue'
  })
}) 