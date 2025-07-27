import { NextApiRequest, NextApiResponse } from 'next'
import { IncomingForm } from 'formidable'
import fs from 'fs'
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
    logger.info('Edge direct transcribe API called')

    // Parse the multipart form data
    const form = new IncomingForm()
    const [fields, files] = await form.parse(req)

    const file = Array.isArray(files.file) ? files.file[0] : files.file
    if (!file) {
      return res.status(400).json({ error: 'No file provided' })
    }

    logger.info('File received for edge processing', { 
      filename: file.originalFilename,
      size: file.size,
      mimetype: file.mimetype
    })

    // Read the file
    const audioBuffer = fs.readFileSync(file.filepath)
    
    // Create a simple task ID
    const taskId = 'task-' + Date.now()

    // Call the Edge Function directly
    const edgeFunctionUrl = `${process.env.SUPABASE_URL}/functions/v1/audio-processor`
    
    const edgeResponse = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        taskId,
        filePath: `temp/${file.originalFilename}`,
        originalFilename: file.originalFilename,
        segmentDurationMinutes: 15
      })
    })

    // Clean up temp file
    fs.unlinkSync(file.filepath)

    if (edgeResponse.ok) {
      const edgeResult = await edgeResponse.json()
      logger.info('Edge function completed', { 
        taskId,
        segmentsCreated: edgeResult.segmentsCreated 
      })

      return res.status(200).json({
        success: true,
        taskId,
        message: 'Audio processing started with Edge Function',
        totalDuration: edgeResult.totalDuration,
        segmentsCreated: edgeResult.segmentsCreated,
        segments: edgeResult.segments
      })
    } else {
      const errorText = await edgeResponse.text()
      logger.error('Edge function failed', new Error(errorText))
      
      return res.status(500).json({ 
        error: 'Edge function processing failed',
        details: errorText 
      })
    }

  } catch (error) {
    logger.error('Edge direct transcribe API error', error as Error)
    return res.status(500).json({ 
      error: 'Processing failed',
      details: (error as Error).message 
    })
  }
}