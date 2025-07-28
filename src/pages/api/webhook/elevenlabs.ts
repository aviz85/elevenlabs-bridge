import { NextApiRequest, NextApiResponse } from 'next'
import { transcriptionService } from '@/services/transcription'
import { withErrorHandling, withMethodValidation, withValidation, compose } from '@/lib/middleware'
import { ValidationError, AuthenticationError } from '@/lib/errors'
import { logger } from '@/lib/logger'

// Webhook validation - TEMPORARY DEBUG MODE
const validateElevenLabsWebhook = async (req: NextApiRequest) => {
  // 🔍 FULL DEBUG MODE - Log absolutely everything
  logger.info('🔍 ElevenLabs Debug Webhook - Full Request', {
    method: req.method,
    url: req.url,
    query: req.query,
    headers: req.headers,
    body: req.body,
    bodyType: typeof req.body,
    bodyKeys: req.body ? Object.keys(req.body) : [],
    contentType: req.headers['content-type'],
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  })

  // Log body content in detail
  if (req.body) {
    logger.info('🔍 ElevenLabs Debug Webhook - Body Details', {
      bodyStringified: JSON.stringify(req.body, null, 2),
      bodyValues: Object.entries(req.body).map(([key, value]) => ({
        key,
        value,
        type: typeof value,
        isNull: value === null,
        isUndefined: value === undefined
      }))
    })
  }

  // DON'T VALIDATE ANYTHING - JUST LOG AND CONTINUE
  logger.info('🔍 Debug mode - skipping validation, accepting all webhooks')

  // Validate webhook signature if provided
  const signature = req.headers['x-elevenlabs-signature'] as string
  if (signature) {
    const payload = JSON.stringify(req.body)
    const { elevenLabsService } = await import('@/services/elevenlabs')
    
    // SKIP SIGNATURE VALIDATION IN DEBUG MODE
    logger.info('🔍 Debug mode - skipping signature validation')
  }
}

const handler = compose(
  withMethodValidation(['POST']),
  withValidation(validateElevenLabsWebhook)
)(async (req, res, context) => {
  // TEMPORARY DEBUG MODE - Just log and return success
  logger.info('🔍 ElevenLabs Webhook Handler - DEBUG MODE', {
    body: req.body,
    query: req.query,
    method: req.method,
    url: req.url
  })

  // For now, just return success without processing
  // This allows us to see what ElevenLabs sends without errors

  logger.businessEvent('elevenlabs-webhook-debug-processed', {
    ...context,
    receivedPayload: req.body,
    debugMode: true
  })

  res.status(200).json({ 
    message: 'Debug webhook processed successfully',
    timestamp: new Date().toISOString(),
    receivedData: req.body
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