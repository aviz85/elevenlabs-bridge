import { NextApiRequest, NextApiResponse } from 'next'
import { transcriptionService } from '@/services/transcription'
import { handleApiError } from '@/lib/errors'
import { logger } from '@/lib/logger'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    logger.info('ElevenLabs webhook received', { 
      body: req.body,
      headers: {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent']
      }
    })

    const { task_id, status, result, error } = req.body

    if (!task_id || !status) {
      return res.status(400).json({ error: 'Missing required fields: task_id, status' })
    }

    await transcriptionService.handleElevenLabsWebhook({
      task_id,
      status,
      result,
      error
    })

    logger.info('ElevenLabs webhook processed', { task_id, status })

    res.status(200).json({ message: 'Webhook processed successfully' })

  } catch (error) {
    logger.error('ElevenLabs webhook error', error as Error)
    return handleApiError(error).json()
  }
}