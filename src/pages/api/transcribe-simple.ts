import { NextApiRequest, NextApiResponse } from 'next'
import { IncomingForm } from 'formidable'
import fs from 'fs'
import { elevenLabsService } from '@/services/elevenlabs'
import { logger } from '@/lib/logger'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    logger.info('Simple transcribe API called')

    // Parse the multipart form data
    const form = new IncomingForm()
    const [fields, files] = await form.parse(req)

    const file = Array.isArray(files.file) ? files.file[0] : files.file
    if (!file) {
      return res.status(400).json({ error: 'No file provided' })
    }

    logger.info('File received', { 
      filename: file.originalFilename,
      size: file.size,
      mimetype: file.mimetype
    })

    // Read the file
    const audioBuffer = fs.readFileSync(file.filepath)

    // Transcribe using ElevenLabs (sync mode - no webhook)
    const result = await elevenLabsService.transcribeAudio(audioBuffer, {
      modelId: 'scribe_v1'
      // No webhookUrl = sync mode
    })

    // Clean up temp file
    fs.unlinkSync(file.filepath)

    if (result.result) {
      logger.info('Transcription completed', { 
        textLength: result.result.text?.length || 0 
      })

      return res.status(200).json({
        success: true,
        transcription: result.result.text,
        language: result.result.language_code,
        filename: file.originalFilename
      })
    } else {
      return res.status(500).json({ error: 'No transcription result received' })
    }

  } catch (error) {
    logger.error('Simple transcribe API error', error as Error)
    return res.status(500).json({ 
      error: 'Transcription failed',
      details: (error as Error).message 
    })
  }
}