import { NextApiRequest, NextApiResponse } from 'next'
import { logger } from '@/lib/logger'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Log absolutely everything that comes from ElevenLabs
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

  // Always return success so ElevenLabs doesn't retry
  res.status(200).json({ 
    message: 'Debug webhook received successfully',
    timestamp: new Date().toISOString(),
    receivedData: {
      method: req.method,
      body: req.body,
      query: req.query
    }
  })
} 