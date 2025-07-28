import { NextApiRequest, NextApiResponse } from 'next'
import { transcriptionService } from '@/services/transcription'
import { withErrorHandling, withMethodValidation, withValidation, compose } from '@/lib/middleware'
import { ValidationError } from '@/lib/errors'
import { logger } from '@/lib/logger'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
}

// Request validation
const validateTranscribeRequest = (req: NextApiRequest) => {
  const { webhookUrl, filename } = req.body

  if (!webhookUrl || !filename) {
    throw new ValidationError('Missing required fields: webhookUrl, filename', {
      missing: {
        webhookUrl: !webhookUrl,
        filename: !filename
      }
    })
  }

  // Validate webhook URL format
  try {
    const url = new URL(webhookUrl)
    if (url.protocol !== 'https:') {
      throw new ValidationError('Webhook URL must use HTTPS protocol', { webhookUrl })
    }
  } catch (error) {
    throw new ValidationError('Invalid webhook URL format', { webhookUrl })
  }

  // Validate filename
  if (typeof filename !== 'string' || filename.trim().length === 0) {
    throw new ValidationError('Filename must be a non-empty string', { filename })
  }
}

const handler = compose(
  withMethodValidation(['POST']),
  withValidation(validateTranscribeRequest)
)(async (req, res, context) => {
  const { webhookUrl, filename, fileSize } = req.body

  logger.businessEvent('transcription-request-received', {
    ...context,
    filename,
    fileSize: fileSize || 'unknown',
    webhookUrl
  })

  // Create mock file object for testing
  const mockFile = {
    name: filename,
    size: fileSize || 1024 * 1024, // Default 1MB
    type: 'audio/mp3'
  } as File

  // ALWAYS USE GOOGLE CLOUD FUNCTIONS - NO MOCK SERVICE
  const FORCE_GOOGLE_CLOUD_FUNCTIONS = true
  
  logger.info('FORCING Google Cloud Functions usage', {
    filename,
    fileSize: fileSize || 0,
    forceGoogle: FORCE_GOOGLE_CLOUD_FUNCTIONS
  })

  const result = await transcriptionService.processTranscriptionRequest({
    file: mockFile,
    webhookUrl,
    useRealElevenLabs: FORCE_GOOGLE_CLOUD_FUNCTIONS  // ALWAYS TRUE
  })

  logger.businessEvent('transcription-request-processed', {
    ...context,
    taskId: result.taskId,
    filename
  })

  res.status(200).json({
    taskId: result.taskId,
    status: 'processing',
    message: 'Transcription started successfully'
  })
})

export default withErrorHandling(handler, { 
  operation: 'transcribe',
  extractContext: (req) => ({
    operation: 'transcribe'
  })
})