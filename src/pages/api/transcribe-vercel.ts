import { NextApiRequest, NextApiResponse } from 'next'
import { IncomingForm } from 'formidable'
import fs from 'fs'
import { elevenLabsService } from '@/services/elevenlabs'
import { vercelAudioProcessingService } from '@/services/vercel-audio-processing'
import { logger } from '@/lib/logger'
import { validateFile, validateWebhookUrl } from '@/utils/validation'

export const config = {
  api: {
    bodyParser: false,
    maxDuration: 300, // 5 minutes max
  },
}

interface TranscriptionTask {
  id: string
  status: 'processing' | 'completed' | 'failed'
  originalFilename: string
  totalSegments: number
  completedSegments: number
  segments: Array<{
    id: string
    startTime: number
    endTime: number
    status: 'pending' | 'processing' | 'completed' | 'failed'
    transcriptionText?: string
    error?: string
  }>
  finalTranscription?: string
  error?: string
  createdAt: string
  completedAt?: string
}

// In-memory storage for demo (in production, use a database)
const tasks = new Map<string, TranscriptionTask>()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    logger.info('Vercel transcribe API called')

    // Parse the multipart form data
    const form = new IncomingForm()
    const [fields, files] = await form.parse(req)

    const file = Array.isArray(files.file) ? files.file[0] : files.file
    const webhookUrl = Array.isArray(fields.webhookUrl) ? fields.webhookUrl[0] : fields.webhookUrl

    if (!file) {
      return res.status(400).json({ error: 'No file provided' })
    }

    // Validate file
    const validation = vercelAudioProcessingService.validateAudioFile(
      file.originalFilename || 'unknown',
      file.size
    )

    if (!validation.valid) {
      return res.status(400).json({ error: validation.error })
    }

    // Validate webhook URL if provided
    if (webhookUrl) {
      try {
        validateWebhookUrl(webhookUrl)
      } catch (error) {
        return res.status(400).json({ error: (error as Error).message })
      }
    }

    logger.info('File received', { 
      filename: file.originalFilename,
      size: file.size,
      mimetype: file.mimetype
    })

    // Read the file
    const audioBuffer = fs.readFileSync(file.filepath)

    // Create task
    const taskId = crypto.randomUUID()
    const task: TranscriptionTask = {
      id: taskId,
      status: 'processing',
      originalFilename: file.originalFilename || 'unknown',
      totalSegments: 0,
      completedSegments: 0,
      segments: [],
      createdAt: new Date().toISOString()
    }

    tasks.set(taskId, task)

    // Process audio in background
    processAudioAsync(taskId, audioBuffer, file.originalFilename || 'unknown', webhookUrl)
      .catch(error => {
        logger.error('Background processing failed', error)
        const failedTask = tasks.get(taskId)
        if (failedTask) {
          failedTask.status = 'failed'
          failedTask.error = error.message
          failedTask.completedAt = new Date().toISOString()
          tasks.set(taskId, failedTask)
        }
      })

    // Clean up temp file
    fs.unlinkSync(file.filepath)

    return res.status(200).json({
      success: true,
      taskId,
      message: 'Transcription started'
    })

  } catch (error) {
    logger.error('Vercel transcribe API error', error as Error)
    return res.status(500).json({ 
      error: 'Transcription failed',
      details: (error as Error).message 
    })
  }
}

async function processAudioAsync(
  taskId: string, 
  audioBuffer: Buffer, 
  filename: string,
  webhookUrl?: string
): Promise<void> {
  try {
    const task = tasks.get(taskId)
    if (!task) return

    logger.info('Starting background audio processing', { taskId, filename })

    // Get audio duration
    const duration = await vercelAudioProcessingService.getAudioDuration(audioBuffer, filename)
    
    // Split into segments (logical splitting for Vercel)
    const segments = await vercelAudioProcessingService.splitAudioByTime(audioBuffer, 900) // 15 minutes

    // Update task with segments
    task.totalSegments = segments.length
    task.segments = segments.map(segment => ({
      id: segment.id,
      startTime: segment.startTime,
      endTime: segment.endTime,
      status: 'pending' as const
    }))
    tasks.set(taskId, task)

    logger.info('Processing segments', { taskId, segmentCount: segments.length })

    // Process segments sequentially to avoid rate limits
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]
      const taskSegment = task.segments.find(s => s.id === segment.id)
      
      if (!taskSegment) continue

      try {
        taskSegment.status = 'processing'
        tasks.set(taskId, task)

        logger.info('Processing segment', { taskId, segmentId: segment.id, index: i + 1 })

        // For segments longer than ElevenLabs limit, we'll send the full file
        // and let ElevenLabs handle it (or implement client-side chunking)
        const result = await elevenLabsService.transcribeAudio(audioBuffer, {
          modelId: 'scribe_v1'
          // No webhook for Vercel version - we'll use sync processing
        })

        if (result.result) {
          taskSegment.status = 'completed'
          taskSegment.transcriptionText = result.result.text
          task.completedSegments++
          
          logger.info('Segment completed', { 
            taskId, 
            segmentId: segment.id,
            textLength: result.result.text?.length || 0
          })
        } else {
          throw new Error('No transcription result received')
        }

      } catch (error) {
        logger.error('Segment processing failed', error as Error, { 
          taskId, 
          segmentId: segment.id 
        })
        
        taskSegment.status = 'failed'
        taskSegment.error = (error as Error).message
      }

      tasks.set(taskId, task)

      // Add delay between segments to respect rate limits
      if (i < segments.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
    }

    // Assemble final result
    const completedSegments = task.segments.filter(s => s.status === 'completed')
    const failedSegments = task.segments.filter(s => s.status === 'failed')

    if (failedSegments.length === 0) {
      // All segments completed
      task.status = 'completed'
      task.finalTranscription = completedSegments
        .sort((a, b) => a.startTime - b.startTime)
        .map(s => s.transcriptionText)
        .filter(Boolean)
        .join(' ')
      
      logger.info('Task completed successfully', { 
        taskId,
        finalLength: task.finalTranscription?.length || 0
      })
    } else {
      // Some segments failed
      task.status = 'failed'
      task.error = `${failedSegments.length} segments failed to process`
      
      logger.error('Task completed with errors', new Error('Some segments failed'), { 
        taskId,
        failedCount: failedSegments.length
      })
    }

    task.completedAt = new Date().toISOString()
    tasks.set(taskId, task)

    // Send webhook if provided
    if (webhookUrl && task.status === 'completed') {
      try {
        await sendWebhook(webhookUrl, {
          taskId,
          status: task.status,
          transcription: task.finalTranscription,
          originalFilename: task.originalFilename,
          completedAt: task.completedAt
        })
      } catch (error) {
        logger.error('Webhook delivery failed', error as Error, { taskId })
      }
    }

  } catch (error) {
    logger.error('Background processing failed', error as Error, { taskId })
    
    const task = tasks.get(taskId)
    if (task) {
      task.status = 'failed'
      task.error = (error as Error).message
      task.completedAt = new Date().toISOString()
      tasks.set(taskId, task)
    }
  }
}

async function sendWebhook(url: string, payload: any): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    throw new Error(`Webhook failed: ${response.status} ${response.statusText}`)
  }
}

// Export function to get task status
export function getTask(taskId: string): TranscriptionTask | undefined {
  return tasks.get(taskId)
}