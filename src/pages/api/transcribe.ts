import { NextApiRequest, NextApiResponse } from 'next'
import { transcriptionService } from '@/services/transcription'
import { handleApiError } from '@/lib/errors'
import { logger } from '@/lib/logger'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    logger.info('Transcribe API called', { 
      method: req.method,
      contentType: req.headers['content-type']
    })

    // For now, we'll simulate file upload with mock data
    // In real implementation, you'd use multer or similar for file handling
    const { webhookUrl, filename, fileSize } = req.body

    if (!webhookUrl || !filename) {
      return res.status(400).json({
        error: 'Missing required fields: webhookUrl, filename'
      })
    }

    // Create mock file object for testing
    const mockFile = {
      name: filename,
      size: fileSize || 1024 * 1024, // Default 1MB
      type: 'audio/mp3'
    } as File

    const result = await transcriptionService.processTranscriptionRequest({
      file: mockFile,
      webhookUrl
    })

    logger.info('Transcription request processed', { taskId: result.taskId })

    res.status(200).json({
      taskId: result.taskId,
      status: 'processing',
      message: 'Transcription started successfully'
    })

  } catch (error) {
    logger.error('Transcribe API error', error as Error)
    return handleApiError(error).json()
  }
}