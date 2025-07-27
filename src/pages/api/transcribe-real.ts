import { NextApiRequest, NextApiResponse } from 'next'
import { IncomingForm, File } from 'formidable'
import { promises as fs } from 'fs'
import { transcriptionService } from '@/services/transcription'
import { handleApiError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import { validateFile, validateWebhookUrl } from '@/utils/validation'

export const config = {
  api: {
    bodyParser: false, // Disable body parser to handle file uploads
  },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    logger.info('Real transcribe API called', {
      method: req.method,
      contentType: req.headers['content-type']
    })

    // Parse the multipart form data
    const form = new IncomingForm({
      maxFileSize: 100 * 1024 * 1024, // 100MB
      keepExtensions: true,
    })

    const { fields, files } = await new Promise<{ fields: any; files: any }>((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err)
        else resolve({ fields, files })
      })
    })

    // Extract webhook URL from fields
    const webhookUrl = Array.isArray(fields.webhookUrl) ? fields.webhookUrl[0] : fields.webhookUrl
    if (!webhookUrl) {
      return res.status(400).json({ error: 'webhookUrl is required' })
    }

    validateWebhookUrl(webhookUrl)

    // Extract file from files
    const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file
    if (!uploadedFile) {
      return res.status(400).json({ error: 'No file uploaded' })
    }

    const file = uploadedFile as File

    // Validate file
    const mockFileForValidation = {
      name: file.originalFilename || 'unknown',
      size: file.size,
      type: file.mimetype || 'application/octet-stream'
    } as globalThis.File

    validateFile(mockFileForValidation)

    // Read file buffer
    const fileBuffer = await fs.readFile(file.filepath)

    // Create a proper File object for the service
    const fileBlob = new Blob([fileBuffer], { type: file.mimetype || 'audio/mpeg' })
    const properFile = new globalThis.File([fileBlob], file.originalFilename || 'audio.mp3', {
      type: file.mimetype || 'audio/mpeg'
    })

    // Process transcription request
    const result = await transcriptionService.processTranscriptionRequest({
      file: properFile,
      webhookUrl,
      useRealElevenLabs: true // Flag to use real ElevenLabs service
    })

    logger.info('Real transcription request processed', { taskId: result.taskId })

    res.status(200).json({
      taskId: result.taskId,
      status: 'processing',
      message: 'Transcription started successfully with real ElevenLabs API'
    })

  } catch (error) {
    logger.error('Real transcribe API error', error as Error)
    const errorResponse = handleApiError(error)
    return res.status(errorResponse.status || 500).json(errorResponse.body)
  }
}