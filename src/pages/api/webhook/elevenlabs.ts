import { NextApiRequest, NextApiResponse } from 'next'
import { transcriptionService } from '@/services/transcription'
import { withErrorHandling, withMethodValidation, withValidation, compose } from '@/lib/middleware'
import { ValidationError, AuthenticationError } from '@/lib/errors'
import { logger } from '@/lib/logger'

// Webhook validation
const validateElevenLabsWebhook = async (req: NextApiRequest) => {
  const { task_id, status } = req.body

  if (!task_id || !status) {
    throw new ValidationError('Missing required fields: task_id, status', {
      missing: {
        task_id: !task_id,
        status: !status
      }
    })
  }

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
  const { task_id, status, result, error } = req.body
  const segmentId = req.query.segmentId as string

  logger.businessEvent('elevenlabs-webhook-received', {
    ...context,
    taskId: task_id,
    status,
    segmentId: segmentId || 'lookup-by-task-id', // Will lookup by elevenlabs_task_id if no segmentId
    hasResult: !!result,
    hasError: !!error
  })

  // Process webhook with enhanced context
  await transcriptionService.handleElevenLabsWebhook({
    task_id,
    status,
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
    taskId: req.body?.task_id,
    segmentId: req.query.segmentId as string,
    webhookStatus: req.body?.status
  })
})