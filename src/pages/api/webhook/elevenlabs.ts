import { NextApiRequest, NextApiResponse } from 'next'
import { transcriptionService } from '@/services/transcription'
import { withErrorHandling, withMethodValidation, withValidation, compose } from '@/lib/middleware'
import { ValidationError, AuthenticationError } from '@/lib/errors'
import { logger } from '@/lib/logger'

// Webhook validation for ElevenLabs structure
const validateElevenLabsWebhook = async (req: NextApiRequest) => {
  const { type, data } = req.body

  if (!type || !data) {
    throw new ValidationError('Missing required fields: type, data', {
      received: req.body,
      missing: {
        type: !type,
        data: !data
      }
    })
  }

  if (type !== 'speech_to_text_transcription') {
    throw new ValidationError('Invalid webhook type', {
      expectedType: 'speech_to_text_transcription',
      receivedType: type
    })
  }

  if (!data.request_id) {
    throw new ValidationError('Missing request_id in data', {
      dataKeys: Object.keys(data || {}),
      hasRequestId: !!data.request_id
    })
  }

  logger.info('ElevenLabs webhook validation passed', {
    type,
    requestId: data.request_id,
    hasTranscription: !!(data.transcription?.text)
  })

  // Skip webhook signature validation for now - just log if present
  const signature = req.headers['elevenlabs-signature'] as string
  if (signature) {
    logger.info('ElevenLabs webhook signature received (validation skipped)', {
      requestId: data.request_id,
      hasSignature: !!signature
    })
  } else {
    logger.info('ElevenLabs webhook received without signature', {
      requestId: data.request_id
    })
  }
}

const handler = compose(
  withMethodValidation(['POST']),
  withValidation(validateElevenLabsWebhook)
)(async (req, res, context) => {
  const { type, event_timestamp, data } = req.body
  
  // Extract the actual data from ElevenLabs webhook structure
  const requestId = data?.request_id
  const transcription = data?.transcription
  const transcriptionText = transcription?.text || ''
  const languageCode = transcription?.language_code

  logger.businessEvent('elevenlabs-webhook-received', {
    ...context,
    requestId,
    type,
    hasTranscription: !!transcriptionText,
    transcriptionLength: transcriptionText.length,
    languageCode
  })

  // Process webhook with correct ElevenLabs structure
  if (requestId && type === 'speech_to_text_transcription') {
    await transcriptionService.handleElevenLabsWebhook({
      task_id: requestId, // Map request_id to task_id for our system
      status: 'completed', // ElevenLabs only sends completed transcriptions
      result: {
        text: transcriptionText,
        language_code: languageCode,
        words: transcription?.words || []
      },
      error: undefined,
      segmentId: undefined // Will be looked up by task_id
    })

    logger.businessEvent('elevenlabs-webhook-processed', {
      ...context,
      requestId,
      transcriptionLength: transcriptionText.length,
      processed: true
    })
  } else {
    logger.warn('Unknown ElevenLabs webhook type or missing data', {
      type,
      hasRequestId: !!requestId,
      receivedData: req.body
    })
  }

  res.status(200).json({ 
    message: 'Webhook processed successfully',
    requestId,
    type,
    processed: !!(requestId && type === 'speech_to_text_transcription')
  })
})

export default withErrorHandling(handler, { 
  operation: 'elevenlabs-webhook',
  extractContext: (req) => ({
    taskId: req.body?.data?.request_id,
    segmentId: req.query.segmentId as string,
    webhookStatus: req.body?.type || 'unknown'
  })
})