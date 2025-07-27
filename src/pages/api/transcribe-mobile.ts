import { NextApiRequest, NextApiResponse } from 'next'
import { IncomingForm } from 'formidable'
import fs from 'fs'
import { elevenLabsService } from '@/services/elevenlabs'
import { logger } from '@/lib/logger'

export const config = {
  api: {
    bodyParser: false,
    maxDuration: 300, // 5 minutes
  },
}

interface MobileTranscriptionTask {
  id: string
  status: 'uploading' | 'processing' | 'completed' | 'failed'
  originalFilename: string
  fileSize: number
  progress: number
  transcription?: string
  error?: string
  createdAt: string
  completedAt?: string
  estimatedDuration?: number
}

// In-memory storage for demo (במציאות - מסד נתונים)
const tasks = new Map<string, MobileTranscriptionTask>()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // CORS headers for mobile apps
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    logger.info('Mobile transcribe API called', {
      userAgent: req.headers['user-agent'],
      contentType: req.headers['content-type']
    })

    // Parse multipart form data
    const form = new IncomingForm({
      maxFileSize: 100 * 1024 * 1024, // 100MB max
      keepExtensions: true
    })

    const [fields, files] = await form.parse(req)
    const file = Array.isArray(files.file) ? files.file[0] : files.file

    if (!file) {
      return res.status(400).json({ 
        error: 'לא נבחר קובץ',
        code: 'NO_FILE'
      })
    }

    // Validate file
    const supportedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/flac']
    if (!supportedTypes.includes(file.mimetype || '')) {
      return res.status(400).json({ 
        error: 'פורמט קובץ לא נתמך',
        code: 'UNSUPPORTED_FORMAT',
        supportedFormats: supportedTypes
      })
    }

    if (file.size > 100 * 1024 * 1024) {
      return res.status(400).json({ 
        error: 'קובץ גדול מדי (מקסימום 100MB)',
        code: 'FILE_TOO_LARGE'
      })
    }

    // Create task
    const taskId = 'mobile-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
    const task: MobileTranscriptionTask = {
      id: taskId,
      status: 'processing',
      originalFilename: file.originalFilename || 'unknown',
      fileSize: file.size,
      progress: 0,
      createdAt: new Date().toISOString(),
      estimatedDuration: Math.ceil(file.size / (1024 * 1024)) * 30 // Rough estimate: 30 seconds per MB
    }

    tasks.set(taskId, task)

    logger.info('Mobile task created', { 
      taskId,
      filename: task.originalFilename,
      size: task.fileSize
    })

    // Process in background
    processAudioMobile(taskId, file)
      .catch(error => {
        logger.error('Mobile background processing failed', error)
        const failedTask = tasks.get(taskId)
        if (failedTask) {
          failedTask.status = 'failed'
          failedTask.error = error.message
          failedTask.completedAt = new Date().toISOString()
          tasks.set(taskId, failedTask)
        }
      })

    // Return task info immediately
    return res.status(200).json({
      success: true,
      taskId,
      status: 'processing',
      message: 'התמלול החל',
      estimatedDuration: task.estimatedDuration,
      pollUrl: `/api/status-mobile/${taskId}`
    })

  } catch (error) {
    logger.error('Mobile transcribe API error', error as Error)
    return res.status(500).json({ 
      error: 'שגיאה בעיבוד הקובץ',
      code: 'PROCESSING_ERROR',
      details: (error as Error).message 
    })
  }
}

async function processAudioMobile(taskId: string, file: any): Promise<void> {
  const task = tasks.get(taskId)
  if (!task) return

  try {
    logger.info('Starting mobile audio processing', { taskId })

    // Update progress
    task.progress = 10
    tasks.set(taskId, task)

    // Read file
    const audioBuffer = fs.readFileSync(file.filepath)
    
    task.progress = 30
    tasks.set(taskId, task)

    // For mobile - we'll use direct transcription for smaller files
    // and chunked processing for larger files
    if (file.size <= 25 * 1024 * 1024) { // 25MB or less - direct processing
      logger.info('Processing small file directly', { taskId, size: file.size })
      
      task.progress = 50
      tasks.set(taskId, task)

      const result = await elevenLabsService.transcribeAudio(audioBuffer, {
        modelId: 'scribe_v1'
      })

      task.progress = 90
      tasks.set(taskId, task)

      if (result.result) {
        task.status = 'completed'
        task.transcription = result.result.text
        task.progress = 100
        task.completedAt = new Date().toISOString()
        
        logger.info('Mobile transcription completed', { 
          taskId,
          textLength: result.result.text?.length || 0
        })
      } else {
        throw new Error('לא התקבלה תוצאת תמלול')
      }

    } else {
      // Large file - would need chunking (simplified for demo)
      logger.info('Large file detected - would need chunking', { taskId, size: file.size })
      
      task.progress = 50
      tasks.set(taskId, task)

      // For demo - simulate processing
      await new Promise(resolve => setTimeout(resolve, 5000))
      
      task.status = 'completed'
      task.transcription = 'תמלול דמו לקובץ גדול - במימוש מלא יתבצע פיצול לקטעים'
      task.progress = 100
      task.completedAt = new Date().toISOString()
    }

    tasks.set(taskId, task)

  } catch (error) {
    logger.error('Mobile processing failed', error as Error, { taskId })
    
    task.status = 'failed'
    task.error = (error as Error).message
    task.completedAt = new Date().toISOString()
    tasks.set(taskId, task)
  } finally {
    // Cleanup temp file
    try {
      fs.unlinkSync(file.filepath)
    } catch (e) {
      logger.warn('Failed to cleanup temp file', { filepath: file.filepath })
    }
  }
}

// Export function to get task (for status endpoint)
export function getMobileTask(taskId: string): MobileTranscriptionTask | undefined {
  return tasks.get(taskId)
}

// Export tasks map for debugging
export function getAllMobileTasks() {
  return Array.from(tasks.entries())
}