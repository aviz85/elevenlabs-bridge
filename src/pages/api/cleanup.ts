import { NextApiRequest, NextApiResponse } from 'next'
import { cleanupService } from '@/services/cleanup'
import { logger } from '@/lib/logger'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    return handleCleanupTrigger(req, res)
  } else if (req.method === 'GET') {
    return handleCleanupStats(req, res)
  } else {
    res.setHeader('Allow', ['GET', 'POST'])
    return res.status(405).json({ error: 'Method not allowed' })
  }
}

async function handleCleanupTrigger(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { taskId, force = false } = req.body

    logger.info('Manual cleanup triggered', { taskId, force })

    if (taskId) {
      // Clean up specific task
      const success = await cleanupService.cleanupTask(taskId, {
        maxRetries: force ? 5 : 3
      })

      if (success) {
        return res.status(200).json({
          success: true,
          message: `Task ${taskId} cleaned up successfully`
        })
      } else {
        return res.status(400).json({
          success: false,
          message: `Failed to clean up task ${taskId}`
        })
      }
    } else {
      // Perform general cleanup
      const result = await cleanupService.performCleanup({
        maxRetries: force ? 5 : 3,
        batchSize: 25
      })

      return res.status(200).json({
        success: true,
        message: 'Cleanup completed successfully',
        result
      })
    }
  } catch (error) {
    logger.error('Cleanup API error', error as Error)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: (error as Error).message
    })
  }
}

async function handleCleanupStats(req: NextApiRequest, res: NextApiResponse) {
  try {
    const stats = await cleanupService.getCleanupStats()
    
    return res.status(200).json({
      success: true,
      stats
    })
  } catch (error) {
    logger.error('Cleanup stats API error', error as Error)
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: (error as Error).message
    })
  }
}