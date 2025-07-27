import { NextApiRequest, NextApiResponse } from 'next'
import { getMobileTask } from '../transcribe-mobile'
import { logger } from '@/lib/logger'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS headers for mobile apps
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { taskId } = req.query

    if (!taskId || typeof taskId !== 'string') {
      return res.status(400).json({ 
        error: 'מזהה משימה חסר',
        code: 'MISSING_TASK_ID'
      })
    }

    logger.info('Getting mobile task status', { taskId })

    const task = getMobileTask(taskId)

    if (!task) {
      return res.status(404).json({ 
        error: 'משימה לא נמצאה',
        code: 'TASK_NOT_FOUND'
      })
    }

    // Calculate time elapsed
    const createdAt = new Date(task.createdAt)
    const now = new Date()
    const elapsedSeconds = Math.floor((now.getTime() - createdAt.getTime()) / 1000)

    // Estimate remaining time
    let estimatedRemainingSeconds = 0
    if (task.status === 'processing' && task.estimatedDuration) {
      const progressRatio = task.progress / 100
      const estimatedTotalSeconds = task.estimatedDuration
      estimatedRemainingSeconds = Math.max(0, estimatedTotalSeconds - elapsedSeconds)
    }

    const response = {
      taskId: task.id,
      status: task.status,
      progress: task.progress,
      originalFilename: task.originalFilename,
      fileSize: task.fileSize,
      transcription: task.transcription,
      error: task.error,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
      timing: {
        elapsedSeconds,
        estimatedRemainingSeconds,
        estimatedTotalSeconds: task.estimatedDuration || 0
      }
    }

    return res.status(200).json(response)

  } catch (error) {
    logger.error('Mobile status API error', error as Error)
    return res.status(500).json({ 
      error: 'שגיאה בקבלת סטטוס',
      code: 'STATUS_ERROR',
      details: (error as Error).message 
    })
  }
}