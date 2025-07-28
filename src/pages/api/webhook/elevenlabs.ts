import { NextApiRequest, NextApiResponse } from 'next'
import { transcriptionService } from '@/services/transcription'
import { withErrorHandling, withMethodValidation, withValidation, compose } from '@/lib/middleware'
import { ValidationError, AuthenticationError } from '@/lib/errors'
import { logger } from '@/lib/logger'

// Webhook validation
const validateElevenLabsWebhook = async (req: NextApiRequest) => {
  // Log what ElevenLabs actually sends for debugging
  logger.info('ElevenLabs webhook payload', {
    headers: req.headers,
    body: req.body,
    bodyKeys: Object.keys(req.body || {}),
    contentType: req.headers['content-type']
  })

  const { task_id, status, request_id } = req.body

  // Accept either task_id or request_id (ElevenLabs might use either)
  const actualTaskId = task_id || request_id
  
  if (!actualTaskId) {
    throw new ValidationError('Missing required field: task_id or request_id', {
      received: req.body,
      missing: {
        task_id: !task_id,
        request_id: !request_id
      }
    })
  }

  // Status might be optional for some webhook types
  logger.info('ElevenLabs webhook validation passed', {
    taskId: actualTaskId,
    status: status || 'unknown',
    hasStatus: !!status
  })

  // Validate webhook signature if provided
  const signature = req.headers['x-elevenlabs-signature'] as string
  if (signature) {
    const payload = JSON.stringify(req.body)
    const { elevenLabsService } = await import('@/services/elevenlabs')
    
    const isValidSignature = elevenLabsService.validateWebhookSignature(payload, signature)
    if (!isValidSignature) {
      throw new AuthenticationError('Invalid webhook signature', { 
        hasSignature: !!signature,
        taskId: task_id
      })
    }
  }
}

const handler = compose(
  withMethodValidation(['POST']),
  withValidation(validateElevenLabsWebhook)
)(async (req, res, context) => {
  const { task_id, status, result, error, request_id } = req.body
  const segmentId = req.query.segmentId as string
  
  // Use either task_id or request_id
  const actualTaskId = task_id || request_id

  logger.businessEvent('elevenlabs-webhook-received', {
    ...context,
    taskId: actualTaskId,
    status: status || 'unknown',
    segmentId: segmentId || 'lookup-by-task-id',
    hasResult: !!result,
    hasError: !!error,
    originalPayload: req.body
  })

  // Process webhook with enhanced context
  await transcriptionService.handleElevenLabsWebhook({
    task_id: actualTaskId,
    status: status || 'completed', // Default to completed if no status
    result,
    error,
    segmentId // Pass segment ID for better tracking
  })

  logger.businessEvent('elevenlabs-webhook-processed', {
    ...context,
    taskId: task_id,
    status,
    segmentId
  })

  res.status(200).json({ 
    message: 'Webhook processed successfully',
    taskId: task_id,
    segmentId
  })
})

export default withErrorHandling(handler, { 
  operation: 'elevenlabs-webhook',
  extractContext: (req) => ({
    taskId: req.body?.task_id || req.body?.request_id,
    segmentId: req.query.segmentId as string,
    webhookStatus: req.body?.status || 'unknown'
  })
})