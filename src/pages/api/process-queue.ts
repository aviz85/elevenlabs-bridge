import { NextApiRequest, NextApiResponse } from 'next'
import { withErrorHandling } from '../../lib/middleware'
import { logger } from '../../lib/logger'
import { queueManager } from '../../services/queue-manager'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { taskId, maxJobs = 4 } = req.body

  logger.info('Manual queue processing triggered', { taskId, maxJobs })

  try {
    // Force process queue jobs
    const result = await queueManager.forceProcessQueue(maxJobs)
    
    logger.info('Queue processing completed', { 
      processedJobs: result.processedJobs,
      remainingJobs: result.remainingJobs
    })

    return res.status(200).json({
      success: true,
      message: 'Queue processing triggered successfully',
      processedJobs: result.processedJobs,
      remainingJobs: result.remainingJobs
    })
  } catch (error) {
    logger.error('Queue processing failed', error as Error)
    return res.status(500).json({
      success: false,
      error: 'Queue processing failed',
      message: (error as Error).message
    })
  }
}

export default withErrorHandling(handler, {
  operation: 'process-queue',
  extractContext: (req) => ({
    operation: 'process-queue',
    taskId: req.body?.taskId
  })
}) 