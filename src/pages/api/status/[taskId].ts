import { NextApiRequest, NextApiResponse } from 'next'
import { transcriptionService } from '@/services/transcription'
import { handleApiError, NotFoundError } from '@/lib/errors'
import { validateTaskId } from '@/utils/validation'
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

    validateTaskId(taskId)

    logger.info('Status API called', { taskId })

    const result = await transcriptionService.getTaskStatus(taskId)

    if (!result.task) {
      throw new NotFoundError('Task')
    }

    const response = {
      taskId: result.task.id,
      status: result.task.status,
      progress: result.progress,
      originalFilename: result.task.original_filename,
      finalTranscription: result.task.final_transcription,
      error: result.task.error_message,
      createdAt: result.task.created_at,
      completedAt: result.task.completed_at,
      segments: result.segments.map(segment => ({
        id: segment.id,
        startTime: segment.start_time,
        endTime: segment.end_time,
        status: segment.status,
        transcriptionText: segment.transcription_text,
        error: segment.error_message
      }))
    }

    logger.info('Status retrieved', { taskId, status: result.task.status })

    res.status(200).json(response)

  } catch (error) {
    const taskId = typeof req.query.taskId === 'string' ? req.query.taskId : 'unknown'
    logger.error('Status API error', error as Error, { taskId })
    return handleApiError(error).json()
  }
}