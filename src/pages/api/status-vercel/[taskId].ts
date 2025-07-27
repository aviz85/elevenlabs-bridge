import { NextApiRequest, NextApiResponse } from 'next'
import { getTask } from '../transcribe-vercel'
import { logger } from '@/lib/logger'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { taskId } = req.query

    if (!taskId || typeof taskId !== 'string') {
      return res.status(400).json({ error: 'Task ID is required' })
    }

    logger.info('Getting task status', { taskId })

    const task = getTask(taskId)

    if (!task) {
      return res.status(404).json({ error: 'Task not found' })
    }

    // Calculate progress
    const progress = {
      totalSegments: task.totalSegments,
      completedSegments: task.completedSegments,
      percentage: task.totalSegments > 0 
        ? Math.round((task.completedSegments / task.totalSegments) * 100)
        : 0
    }

    return res.status(200).json({
      taskId: task.id,
      status: task.status,
      progress,
      originalFilename: task.originalFilename,
      finalTranscription: task.finalTranscription,
      error: task.error,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
      segments: task.segments
    })

  } catch (error) {
    logger.error('Status API error', error as Error)
    return res.status(500).json({ 
      error: 'Failed to get task status',
      details: (error as Error).message 
    })
  }
}