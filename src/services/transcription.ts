import { databaseService } from './database'
import { mockAudioService } from './mock-audio'
import { mockElevenLabsService } from './mock-elevenlabs'
import { elevenLabsService } from './elevenlabs'
import { audioProcessingService } from './audio-processing'
import { queueManager } from './queue-manager'
import { resultAssemblerService } from './result-assembler'
import { clientWebhookService } from './client-webhook'
import { Task, Segment, TranscribeRequest, CombinedTranscription } from '@/types'
import { logger } from '@/lib/logger'
import { ValidationError, ExternalServiceError } from '@/lib/errors'
import { validateFile, validateWebhookUrl } from '@/utils/validation'

export class TranscriptionService {
  /**
   * Main transcription workflow
   */
  async processTranscriptionRequest(request: TranscribeRequest & { useRealElevenLabs?: boolean }): Promise<{ taskId: string }> {
    logger.info('Starting transcription process', { 
      filename: request.file.name,
      webhookUrl: request.webhookUrl,
      useRealElevenLabs: request.useRealElevenLabs || false
    })

    // Validate inputs
    validateFile(request.file)
    validateWebhookUrl(request.webhookUrl)

    try {
      // Step 1: Create task in database
      const task = await databaseService.createTask({
        client_webhook_url: request.webhookUrl,
        original_filename: request.file.name
      })

      // Step 2: Process audio file (convert and segment)
      console.log('DEBUG: useRealElevenLabs =', request.useRealElevenLabs)
      
      if (request.useRealElevenLabs) {
        console.log('DEBUG: Using REAL audio processing with Google Cloud Functions')
        await this.processRealAudioFile(task, request.file, request.webhookUrl)
      } else {
        console.log('DEBUG: Using MOCK audio processing - THIS IS THE PROBLEM!')
        await this.processAudioFile(task, request.file)
      }

      logger.info('Transcription request processed successfully', { taskId: task.id })
      return { taskId: task.id }

    } catch (error) {
      logger.error('Failed to process transcription request', error as Error)
      throw error
    }
  }

  /**
   * Process real audio file using Supabase Edge Functions and real ElevenLabs API
   */
  private async processRealAudioFile(task: Task, file: File, webhookUrl: string): Promise<void> {
    try {
      logger.info('Processing real audio file', { taskId: task.id, filename: file.name })

      // Check if this is a real File object or just metadata
      const isRealFile = typeof file.arrayBuffer === 'function'
      
      let uploadedPath: string
      let fileSize: number = file.size || 0

      if (isRealFile) {
        // Real file upload - convert to buffer
        const arrayBuffer = await file.arrayBuffer()
        const fileBuffer = Buffer.from(arrayBuffer)
        fileSize = fileBuffer.length

        // Check if we're using Google Cloud Functions and if file is large
        const useGoogle = process.env.USE_GOOGLE_CLOUD_FUNCTIONS === 'true'
        const isLargeFile = fileSize > 50 * 1024 * 1024 // 50MB threshold
        
        if (useGoogle && isLargeFile) {
          // For Google Cloud Functions with large files, we'll bypass Supabase Storage
          uploadedPath = `temp/${file.name}`
          logger.info('Large file detected, bypassing Supabase Storage for Google Cloud Functions', {
            taskId: task.id,
            fileSize: fileSize,
            filename: file.name
          })
        } else {
          // Upload file to Supabase Storage for processing (normal path)
          uploadedPath = await audioProcessingService.uploadFileForProcessing(
            fileBuffer,
            file.name,
            task.id
          )
        }
      } else {
        // Mock file object - create a special path that audio processing will recognize
        uploadedPath = `mock-file-${task.id}/${file.name}`
        logger.info('Using mock file approach for Google Cloud Functions', {
          taskId: task.id,
          fileSize: fileSize,
          filename: file.name,
          mockFile: true,
          uploadedPath
        })
      }

      // Process audio using the appropriate service
      const processingResult = await audioProcessingService.processAudio({
        taskId: task.id,
        filePath: uploadedPath,
        originalFilename: file.name,
        segmentDurationMinutes: 15
      })

      if (!processingResult.success) {
        throw new Error(processingResult.error || 'Audio processing failed')
      }

      logger.info('Audio processing completed', {
        taskId: task.id,
        segmentsCreated: processingResult.segmentsCreated,
        totalDuration: processingResult.totalDuration
      })

      // Update task with processing results
      await databaseService.updateTask(task.id, {
        total_segments: processingResult.segmentsCreated,
        converted_file_path: processingResult.segments[0]?.filePath
      })

      // Get segments from database and add to queue for processing
      const segments = await databaseService.getSegmentsByTaskId(task.id)
      await queueManager.addSegmentsToQueue(segments, task.id)
      
      logger.info('Segments added to processing queue', {
        taskId: task.id,
        segmentCount: segments.length
      })

    } catch (error) {
      logger.error('Failed to process real audio file', error as Error, { taskId: task.id })
      await databaseService.updateTask(task.id, {
        status: 'failed',
        error_message: 'Real audio processing failed'
      })
      throw error
    }
  }

  /**
   * Process audio file: convert to MP3 and create segments (mock version)
   */
  private async processAudioFile(task: Task, file: File): Promise<void> {
    try {
      // Convert to MP3 and get duration
      const { convertedPath, duration } = await mockAudioService.convertToMp3(file)
      
      // Create segments based on duration
      const segmentInfos = await mockAudioService.createSegments(convertedPath, duration)
      
      // Update task with segment count
      await databaseService.updateTask(task.id, {
        converted_file_path: convertedPath,
        total_segments: segmentInfos.length
      })

      // Create segment records in database
      const segments: Segment[] = []
      for (const segmentInfo of segmentInfos) {
        const segment = await databaseService.createSegment({
          task_id: task.id,
          file_path: segmentInfo.filePath,
          start_time: segmentInfo.startTime,
          end_time: segmentInfo.endTime
        })
        segments.push(segment)
      }

      // Start processing segments concurrently
      await this.processSegmentsConcurrently(segments)

    } catch (error) {
      logger.error('Failed to process audio file', error as Error, { taskId: task.id })
      await databaseService.updateTask(task.id, {
        status: 'failed',
        error_message: 'Audio processing failed'
      })
      throw error
    }
  }



  /**
   * Process segments concurrently with ElevenLabs API (mock version)
   */
  private async processSegmentsConcurrently(segments: Segment[]): Promise<void> {
    logger.info('Starting concurrent segment processing', { segmentCount: segments.length })

    const concurrencyLimit = 4 // Max concurrent requests
    const processingPromises: Promise<void>[] = []

    for (let i = 0; i < segments.length; i += concurrencyLimit) {
      const batch = segments.slice(i, i + concurrencyLimit)
      const batchPromises = batch.map(segment => this.processSegment(segment))
      processingPromises.push(...batchPromises)
      
      // Wait for current batch to complete before starting next batch
      await Promise.allSettled(batchPromises)
    }

    logger.info('All segments queued for processing', { totalSegments: segments.length })
  }

  /**
   * Process individual segment with ElevenLabs
   */
  private async processSegment(segment: Segment): Promise<void> {
    try {
      logger.info('Processing segment', { segmentId: segment.id, taskId: segment.task_id })

      // Update segment status to processing
      await databaseService.updateSegment(segment.id, { status: 'processing' })

      // Send to ElevenLabs for transcription
      const { taskId: elevenlabsTaskId } = await mockElevenLabsService.transcribeAudio(
        segment.file_path,
        {
          modelId: 'scribe_v1',
          webhook: true
        }
      )

      // Update segment with ElevenLabs task ID
      await databaseService.updateSegment(segment.id, {
        elevenlabs_task_id: elevenlabsTaskId
      })

      logger.info('Segment sent to ElevenLabs', { 
        segmentId: segment.id, 
        elevenlabsTaskId 
      })

    } catch (error) {
      logger.error('Failed to process segment', error as Error, { segmentId: segment.id })
      
      await databaseService.updateSegment(segment.id, {
        status: 'failed',
        error_message: 'Failed to send to ElevenLabs'
      })
    }
  }

  /**
   * Handle webhook from ElevenLabs with enhanced tracking
   */
  async handleElevenLabsWebhook(payload: {
    task_id: string
    status: 'completed' | 'failed'
    result?: any
    error?: string
    segmentId?: string
  }): Promise<void> {
    logger.info('Processing ElevenLabs webhook', { 
      elevenlabsTaskId: payload.task_id,
      status: payload.status,
      segmentId: payload.segmentId,
      hasResult: !!payload.result
    })

    try {
      // Find segment by ElevenLabs task ID or segment ID
      let segment = null
      
      if (payload.segmentId) {
        // Try to find by segment ID first (more direct)
        try {
          segment = await databaseService.getSegment(payload.segmentId)
          if (segment && segment.elevenlabs_task_id !== payload.task_id) {
            logger.warn('Segment ID and ElevenLabs task ID mismatch', {
              segmentId: payload.segmentId,
              elevenlabsTaskId: payload.task_id,
              segmentElevenlabsTaskId: segment.elevenlabs_task_id
            })
          }
        } catch (error) {
          logger.warn('Failed to find segment by segment ID', {
            segmentId: payload.segmentId,
            error: (error as Error).message
          })
        }
      }
      
      // Fallback to finding by ElevenLabs task ID
      if (!segment) {
        segment = await databaseService.getSegmentByElevenLabsTaskId(payload.task_id)
      }
      
      if (!segment) {
        logger.warn('Segment not found for webhook', { 
          elevenlabsTaskId: payload.task_id,
          segmentId: payload.segmentId
        })
        return
      }

      // Update segment based on webhook status
      if (payload.status === 'completed' && payload.result) {
        await databaseService.updateSegment(segment.id, {
          status: 'completed',
          transcription_text: payload.result.text,
          completed_at: new Date().toISOString()
        })
      } else {
        await databaseService.updateSegment(segment.id, {
          status: 'failed',
          error_message: payload.error || 'Transcription failed',
          completed_at: new Date().toISOString()
        })
      }

      // Check if all segments for this task are complete
      await this.checkTaskCompletion(segment.task_id)

    } catch (error) {
      logger.error('Failed to process ElevenLabs webhook', error as Error, { 
        elevenlabsTaskId: payload.task_id 
      })
    }
  }

  /**
   * Check if task is complete and assemble final result
   */
  private async checkTaskCompletion(taskId: string): Promise<void> {
    try {
      const task = await databaseService.getTask(taskId)
      if (!task) return

      const segments = await databaseService.getSegmentsByTaskId(taskId)
      const completedSegments = segments.filter(s => s.status === 'completed')
      const failedSegments = segments.filter(s => s.status === 'failed')

      // Update completed segments count
      await databaseService.updateTask(taskId, {
        completed_segments: completedSegments.length
      })

      // Check if all segments are done (completed or failed)
      const totalProcessed = completedSegments.length + failedSegments.length
      if (totalProcessed === task.total_segments) {
        if (failedSegments.length === 0) {
          // All segments completed successfully
          await this.assembleAndDeliverResult(task, completedSegments)
        } else {
          // Some segments failed
          await databaseService.updateTask(taskId, {
            status: 'failed',
            error_message: `${failedSegments.length} segments failed to process`,
            completed_at: new Date().toISOString()
          })
        }
      }

    } catch (error) {
      logger.error('Failed to check task completion', error as Error, { taskId })
    }
  }

  /**
   * Assemble final transcription and deliver to client
   */
  private async assembleAndDeliverResult(task: Task, segments: Segment[]): Promise<void> {
    const startTime = Date.now()
    
    try {
      logger.info('Assembling final transcription', { taskId: task.id, segmentCount: segments.length })

      // Use result assembler service to combine segments
      const combinedTranscription = await resultAssemblerService.combineSegments(segments)

      // Update task with final result
      await databaseService.updateTask(task.id, {
        status: 'completed',
        final_transcription: combinedTranscription.text,
        completed_at: new Date().toISOString()
      })

      // Send webhook to client with comprehensive retry logic
      const deliveryTracking = await clientWebhookService.sendWebhookNotification(
        task,
        combinedTranscription
      )

      const processingTime = Date.now() - startTime

      logger.info('Transcription completed and webhook delivery attempted', {
        taskId: task.id,
        webhookStatus: deliveryTracking.finalStatus,
        webhookAttempts: deliveryTracking.attempts.length,
        processingTimeMs: processingTime,
        transcriptionLength: combinedTranscription.text.length,
        segmentCount: combinedTranscription.segments.length
      })

      // If webhook delivery failed, log additional details but don't fail the task
      if (deliveryTracking.finalStatus === 'failed') {
        logger.warn('Webhook delivery failed but transcription completed successfully', {
          taskId: task.id,
          webhookUrl: task.client_webhook_url,
          finalAttempt: deliveryTracking.attempts[deliveryTracking.attempts.length - 1]
        })
      }

    } catch (error) {
      logger.error('Failed to assemble and deliver result', error as Error, { 
        taskId: task.id,
        processingTimeMs: Date.now() - startTime
      })
      
      // Update task as failed and attempt to send failure webhook
      await databaseService.updateTask(task.id, {
        status: 'failed',
        error_message: 'Failed to assemble final result',
        completed_at: new Date().toISOString()
      })

      // Attempt to send failure notification
      try {
        await clientWebhookService.sendWebhookNotification(
          task,
          undefined,
          'Failed to assemble final transcription result'
        )
      } catch (webhookError) {
        logger.error('Failed to send failure webhook notification', webhookError as Error, {
          taskId: task.id
        })
      }
    }
  }

  /**
   * Get task status with progress information
   */
  async getTaskStatus(taskId: string): Promise<{
    task: Task
    segments: Segment[]
    progress: { totalSegments: number; completedSegments: number; percentage: number }
  }> {
    const task = await databaseService.getTask(taskId)
    if (!task) {
      throw new ValidationError('Task not found')
    }

    const segments = await databaseService.getSegmentsByTaskId(taskId)
    const completedSegments = segments.filter(s => s.status === 'completed').length

    return {
      task,
      segments,
      progress: {
        totalSegments: task.total_segments,
        completedSegments,
        percentage: Math.round((completedSegments / task.total_segments) * 100)
      }
    }
  }
}

export const transcriptionService = new TranscriptionService()