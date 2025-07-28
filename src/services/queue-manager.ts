import { databaseService } from './database'
import { elevenLabsService } from './elevenlabs'
import { audioProcessingService } from './audio-processing'
import { Segment } from '@/types'
import { logger } from '@/lib/logger'
import { ExternalServiceError } from '@/lib/errors'

export interface QueueConfig {
  maxConcurrentJobs: number
  retryAttempts: number
  retryDelayMs: number
  retryBackoffMultiplier: number
  maxRetryDelayMs: number
}

export interface QueueJob {
  id: string
  segmentId: string
  taskId: string
  filePath: string
  priority: number
  attempts: number
  maxAttempts: number
  createdAt: Date
  scheduledAt: Date
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'retrying'
  error?: string
}

export interface QueueStats {
  pending: number
  processing: number
  completed: number
  failed: number
  retrying: number
  totalJobs: number
}

/**
 * Queue Manager for handling concurrent segment processing with ElevenLabs API
 */
export class QueueManager {
  private jobs: Map<string, QueueJob> = new Map()
  private processingJobs: Set<string> = new Set()
  private config: QueueConfig
  private isProcessing: boolean = false
  private processingInterval?: NodeJS.Timeout

  constructor(config?: Partial<QueueConfig>) {
    this.config = {
      maxConcurrentJobs: 8,  // ✅ Increase from 4 to 8 for faster processing
      retryAttempts: 3,
      retryDelayMs: 1000,
      retryBackoffMultiplier: 2,
      maxRetryDelayMs: 30000,
      ...config
    }
  }

  /**
   * Add a segment to the processing queue
   */
  async addSegmentToQueue(segment: Segment, priority: number = 0): Promise<string> {
    const jobId = `job_${segment.id}_${Date.now()}`
    
    const job: QueueJob = {
      id: jobId,
      segmentId: segment.id,
      taskId: segment.task_id,
      filePath: segment.file_path,
      priority,
      attempts: 0,
      maxAttempts: this.config.retryAttempts,
      createdAt: new Date(),
      scheduledAt: new Date(),
      status: 'pending'
    }

    this.jobs.set(jobId, job)
    
    logger.info('Segment added to queue', {
      jobId,
      segmentId: segment.id,
      taskId: segment.task_id,
      priority,
      queueSize: this.jobs.size
    })

    // Start processing if not already running
    if (!this.isProcessing) {
      this.startProcessing()
    }

    return jobId
  }

  /**
   * Add multiple segments to the queue
   */
  async addSegmentsToQueue(segments: Segment[], taskId: string): Promise<string[]> {
    const jobIds: string[] = []
    
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]
      // Higher priority for earlier segments to maintain order
      const priority = segments.length - i
      const jobId = await this.addSegmentToQueue(segment, priority)
      jobIds.push(jobId)
    }

    logger.info('Multiple segments added to queue', {
      taskId,
      segmentCount: segments.length,
      jobIds
    })

    return jobIds
  }

  /**
   * Start the queue processing loop
   */
  private startProcessing(): void {
    if (this.isProcessing) return

    this.isProcessing = true
    logger.info('Queue processing started', {
      maxConcurrentJobs: this.config.maxConcurrentJobs
    })

    // Process jobs every 100ms
    this.processingInterval = setInterval(() => {
      this.processNextJobs()
    }, 100)
  }

  /**
   * Stop the queue processing
   */
  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval)
      this.processingInterval = undefined
    }
    this.isProcessing = false
    logger.info('Queue processing stopped')
  }

  /**
   * Process the next available jobs up to the concurrency limit
   */
  private async processNextJobs(): Promise<void> {
    const availableSlots = this.config.maxConcurrentJobs - this.processingJobs.size
    if (availableSlots <= 0) return

    // Get pending jobs sorted by priority (higher first) and scheduled time
    const pendingJobs = Array.from(this.jobs.values())
      .filter(job => 
        job.status === 'pending' && 
        job.scheduledAt <= new Date()
      )
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority // Higher priority first
        }
        return a.scheduledAt.getTime() - b.scheduledAt.getTime() // Earlier scheduled first
      })
      .slice(0, availableSlots)

    // Start processing selected jobs
    for (const job of pendingJobs) {
      this.processJob(job).catch(error => {
        logger.error('Unhandled error in job processing', error as Error, {
          jobId: job.id,
          segmentId: job.segmentId
        })
      })
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: QueueJob): Promise<void> {
    this.processingJobs.add(job.id)
    job.status = 'processing'
    job.attempts++

    logger.info('Processing job started', {
      jobId: job.id,
      segmentId: job.segmentId,
      taskId: job.taskId,
      attempt: job.attempts,
      maxAttempts: job.maxAttempts
    })

    try {
      // Update segment status in database
      await databaseService.updateSegment(job.segmentId, {
        status: 'processing'
      })

      // Download segment file from storage
      const segmentBuffer = await audioProcessingService.downloadSegment(job.filePath)

      // Send to ElevenLabs API for transcription with webhook integration
      // Note: webhook URL is pre-configured in ElevenLabs dashboard
      const result = await elevenLabsService.transcribeAudio(segmentBuffer, {
        modelId: 'scribe_v1',
        webhookUrl: 'webhook-configured', // Just trigger webhook mode
        diarize: true,
        tagAudioEvents: true
      })

      if (result.taskId) {
        // Async processing - store ElevenLabs task ID
        await databaseService.updateSegment(job.segmentId, {
          elevenlabs_task_id: result.taskId
        })

        // Mark job as completed (webhook will handle final status)
        job.status = 'completed'
        
        logger.info('Job completed - async processing', {
          jobId: job.id,
          segmentId: job.segmentId,
          elevenlabsTaskId: result.taskId
        })
      } else if (result.result) {
        // Sync processing - store result immediately
        await databaseService.updateSegment(job.segmentId, {
          status: 'completed',
          transcription_text: result.result.text,
          completed_at: new Date().toISOString()
        })

        job.status = 'completed'
        
        logger.info('Job completed - sync processing', {
          jobId: job.id,
          segmentId: job.segmentId,
          textLength: result.result.text.length
        })
      } else {
        throw new Error('Invalid response from ElevenLabs API')
      }

    } catch (error) {
      logger.error('Job processing failed', error as Error, {
        jobId: job.id,
        segmentId: job.segmentId,
        attempt: job.attempts
      })

      await this.handleJobFailure(job, error as Error)
    } finally {
      this.processingJobs.delete(job.id)
    }
  }

  /**
   * Handle job failure with retry logic
   */
  private async handleJobFailure(job: QueueJob, error: Error): Promise<void> {
    const shouldRetry = job.attempts < job.maxAttempts && this.isRetryableError(error)

    if (shouldRetry) {
      // Calculate retry delay with exponential backoff
      const baseDelay = this.config.retryDelayMs * Math.pow(this.config.retryBackoffMultiplier, job.attempts - 1)
      const retryDelay = Math.min(baseDelay, this.config.maxRetryDelayMs)
      
      job.status = 'retrying'
      job.scheduledAt = new Date(Date.now() + retryDelay)
      job.error = error.message

      logger.info('Job scheduled for retry', {
        jobId: job.id,
        segmentId: job.segmentId,
        attempt: job.attempts,
        maxAttempts: job.maxAttempts,
        retryDelay,
        scheduledAt: job.scheduledAt
      })

      // Update segment status
      await databaseService.updateSegment(job.segmentId, {
        status: 'pending' // Reset to pending for retry
      })

      // Schedule retry by changing status back to pending
      setTimeout(() => {
        if (job.status === 'retrying') {
          job.status = 'pending'
        }
      }, retryDelay)

    } else {
      // Max retries exceeded or non-retryable error
      job.status = 'failed'
      job.error = error.message

      logger.error('Job failed permanently', error, {
        jobId: job.id,
        segmentId: job.segmentId,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts
      })

      // Update segment status in database
      await databaseService.updateSegment(job.segmentId, {
        status: 'failed',
        error_message: error.message,
        completed_at: new Date().toISOString()
      })
    }
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryableError(error: Error): boolean {
    // Network errors, timeouts, and 5xx HTTP errors are retryable
    if (error instanceof ExternalServiceError) {
      return true // Most external service errors are retryable
    }

    const message = error.message.toLowerCase()
    
    // Retryable error patterns
    const retryablePatterns = [
      'timeout',
      'network',
      'connection',
      'rate limit',
      'too many requests',
      '5', // 5xx HTTP status codes
      'internal server error',
      'bad gateway',
      'service unavailable',
      'gateway timeout'
    ]

    return retryablePatterns.some(pattern => message.includes(pattern))
  }

  /**
   * Get job by ID
   */
  getJob(jobId: string): QueueJob | undefined {
    return this.jobs.get(jobId)
  }

  /**
   * Get all jobs for a task
   */
  getJobsByTaskId(taskId: string): QueueJob[] {
    return Array.from(this.jobs.values()).filter(job => job.taskId === taskId)
  }

  /**
   * Get queue statistics
   */
  getQueueStats(): QueueStats {
    const jobs = Array.from(this.jobs.values())
    
    return {
      pending: jobs.filter(j => j.status === 'pending').length,
      processing: jobs.filter(j => j.status === 'processing').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      retrying: jobs.filter(j => j.status === 'retrying').length,
      totalJobs: jobs.length
    }
  }

  /**
   * Clear completed and failed jobs older than specified time
   */
  cleanupOldJobs(olderThanMs: number = 24 * 60 * 60 * 1000): number {
    const cutoffTime = new Date(Date.now() - olderThanMs)
    let removedCount = 0

    for (const [jobId, job] of Array.from(this.jobs.entries())) {
      if (
        (job.status === 'completed' || job.status === 'failed') &&
        job.createdAt < cutoffTime
      ) {
        this.jobs.delete(jobId)
        removedCount++
      }
    }

    if (removedCount > 0) {
      logger.info('Cleaned up old jobs', { removedCount, totalJobs: this.jobs.size })
    }

    return removedCount
  }

  /**
   * Cancel all jobs for a task
   */
  cancelTaskJobs(taskId: string): number {
    const taskJobs = this.getJobsByTaskId(taskId)
    let cancelledCount = 0

    for (const job of taskJobs) {
      if (job.status === 'pending' || job.status === 'retrying') {
        job.status = 'failed'
        job.error = 'Cancelled by user'
        cancelledCount++
      }
    }

    logger.info('Cancelled task jobs', { taskId, cancelledCount })
    return cancelledCount
  }

  /**
   * Force process queue jobs (for serverless environments where setInterval doesn't work)
   */
  async forceProcessQueue(maxJobs: number = 4): Promise<{ processedJobs: number; remainingJobs: number }> {
    logger.info('Force processing queue', { 
      totalJobs: this.jobs.size,
      maxJobs,
      processingJobs: this.processingJobs.size
    })

    // In serverless environment, reload pending segments from database
    await this.loadPendingSegmentsFromDatabase()

    // 🧹 CLEANUP: Remove old completed/failed jobs to prevent memory bloat
    this.cleanupOldJobs(5 * 60 * 1000) // Remove jobs older than 5 minutes

    let processedJobs = 0
    const availableSlots = maxJobs - this.processingJobs.size

    if (availableSlots <= 0) {
      logger.info('No available slots for processing', { 
        maxJobs,
        currentlyProcessing: this.processingJobs.size
      })
      return {
        processedJobs: 0,
        remainingJobs: this.jobs.size
      }
    }

    // Get pending jobs sorted by priority and scheduled time
    const pendingJobs = Array.from(this.jobs.values())
      .filter(job => 
        job.status === 'pending' && 
        job.scheduledAt <= new Date()
      )
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority // Higher priority first
        }
        return a.scheduledAt.getTime() - b.scheduledAt.getTime() // Earlier scheduled first
      })
      .slice(0, availableSlots)

    logger.info('Found pending jobs for processing', {
      pendingJobsCount: pendingJobs.length,
      availableSlots
    })

    // Process selected jobs
    const processingPromises = pendingJobs.map(job => {
      processedJobs++
      return this.processJob(job).catch(error => {
        logger.error('Error processing job in force queue', error as Error, {
          jobId: job.id,
          segmentId: job.segmentId
        })
      })
    })

    // Wait for all jobs to start processing (but don't wait for completion)
    await Promise.allSettled(processingPromises)

    const remainingJobs = Array.from(this.jobs.values())
      .filter(job => job.status === 'pending').length

    logger.info('Force queue processing completed', {
      processedJobs,
      remainingJobs
    })

    return {
      processedJobs,
      remainingJobs
    }
  }

  /**
   * 🔥 CRITICAL: Sync in-memory jobs with database status to remove completed jobs
   */
  private async syncJobsWithDatabase(): Promise<void> {
    try {
      const { supabaseAdmin } = await import('../lib/supabase')
      
      // Get all segments that should be in processing but are actually completed/failed
      const processingJobIds = Array.from(this.processingJobs)
      const jobSegmentIds = processingJobIds.map(jobId => {
        const job = this.jobs.get(jobId)
        return job?.segmentId
      }).filter(Boolean)
      
      if (jobSegmentIds.length === 0) return
      
      const { data: segments, error } = await supabaseAdmin
        .from('segments')
        .select('id, status')
        .in('id', jobSegmentIds)
      
      if (error) {
        logger.error('Failed to sync jobs with database', error)
        return
      }
      
      let cleanedJobs = 0
      
      // Remove completed/failed jobs from processingJobs set
      for (const jobId of processingJobIds) {
        const job = this.jobs.get(jobId)
        if (!job) continue
        
        const segment = segments?.find(s => s.id === job.segmentId)
        if (segment && (segment.status === 'completed' || segment.status === 'failed')) {
          this.processingJobs.delete(jobId)
          job.status = segment.status as 'completed' | 'failed'
          cleanedJobs++
          
          logger.info('Cleaned completed job from processing set', {
            jobId,
            segmentId: job.segmentId,
            status: segment.status
          })
        }
      }
      
      if (cleanedJobs > 0) {
        logger.info('Jobs sync completed', {
          cleanedJobs,
          remainingProcessingJobs: this.processingJobs.size
        })
      }
      
    } catch (error) {
      logger.error('Failed to sync jobs with database', error as Error)
    }
  }

  /**
   * Load pending segments from database and add them to queue (for serverless environments)
   */
  private async loadPendingSegmentsFromDatabase(): Promise<void> {
    try {
      const { supabaseAdmin } = await import('../lib/supabase')
      
      // 🔥 CRITICAL FIX: First, clean up completed/failed jobs from memory
      await this.syncJobsWithDatabase()
      
      // Get all pending segments from database
      const { data: pendingSegments, error } = await supabaseAdmin
        .from('segments')
        .select('*')
        .eq('status', 'pending')
        .order('start_time', { ascending: true })
      
      if (error) {
        logger.error('Failed to load pending segments from database', error)
        return
      }
      
      if (!pendingSegments || pendingSegments.length === 0) {
        logger.info('No pending segments found in database')
        return
      }
      
      logger.info('Loading pending segments from database', {
        segmentCount: pendingSegments.length
      })
      
      // Add segments to queue if not already present
      for (const segment of pendingSegments) {
        const jobId = `job_${segment.id}_${Date.now()}`
        
        // Check if job already exists
        if (this.jobs.has(jobId)) {
          continue
        }
        
        const job: QueueJob = {
          id: jobId,
          segmentId: segment.id,
          taskId: segment.task_id,
          filePath: segment.file_path,
          priority: 8 - Math.floor(segment.start_time / 900), // Earlier segments have higher priority
          attempts: 0,
          maxAttempts: this.config.retryAttempts,
          createdAt: new Date(segment.created_at),
          scheduledAt: new Date(),
          status: 'pending'
        }
        
        this.jobs.set(jobId, job)
      }
      
      logger.info('Loaded pending segments into queue', {
        totalJobs: this.jobs.size,
        loadedSegments: pendingSegments.length
      })
      
    } catch (error) {
      logger.error('Error loading pending segments from database', error as Error)
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): QueueConfig {
    return { ...this.config }
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<QueueConfig>): void {
    this.config = { ...this.config, ...newConfig }
    logger.info('Queue configuration updated', this.config)
  }

  /**
   * Construct webhook URL for a specific segment
   */
  private constructWebhookUrl(segmentId: string): string {
    const baseUrl = process.env.WEBHOOK_BASE_URL || 'http://localhost:3000'
    const webhookPath = '/api/webhook/elevenlabs'
    
    // Include segment ID as query parameter for better tracking
    const webhookUrl = `${baseUrl}${webhookPath}?segmentId=${segmentId}`
    
    logger.debug('Constructed webhook URL', { segmentId, webhookUrl })
    return webhookUrl
  }

  /**
   * Validate webhook configuration
   */
  async validateWebhookConfiguration(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = []

    // Check if webhook base URL is configured
    if (!process.env.WEBHOOK_BASE_URL) {
      errors.push('WEBHOOK_BASE_URL environment variable is not configured')
    } else {
      try {
        const url = new URL(process.env.WEBHOOK_BASE_URL)
        if (url.protocol !== 'https:' && !url.hostname.includes('localhost')) {
          errors.push('Webhook URL should use HTTPS in production')
        }
      } catch {
        errors.push('Invalid WEBHOOK_BASE_URL format')
      }
    }

    // Check ElevenLabs webhook configuration
    try {
      const webhookStatus = await elevenLabsService.getWebhookStatus()
      if (!webhookStatus.configured) {
        errors.push('ElevenLabs webhook is not configured')
      }
    } catch (error) {
      errors.push(`Failed to check ElevenLabs webhook status: ${(error as Error).message}`)
    }

    const valid = errors.length === 0
    
    logger.info('Webhook configuration validation', { valid, errors })
    
    return { valid, errors }
  }

  /**
   * Get webhook integration statistics
   */
  getWebhookStats(): {
    totalWebhooksSent: number
    pendingWebhooks: number
    failedWebhooks: number
    webhookSuccessRate: number
  } {
    const jobs = Array.from(this.jobs.values())
    const totalWebhooksSent = jobs.filter(job => 
      job.status === 'processing' || job.status === 'completed' || job.status === 'failed'
    ).length
    
    const pendingWebhooks = jobs.filter(job => job.status === 'processing').length
    const failedWebhooks = jobs.filter(job => job.status === 'failed').length
    const successfulWebhooks = jobs.filter(job => job.status === 'completed').length
    
    const webhookSuccessRate = totalWebhooksSent > 0 
      ? (successfulWebhooks / totalWebhooksSent) * 100 
      : 0

    return {
      totalWebhooksSent,
      pendingWebhooks,
      failedWebhooks,
      webhookSuccessRate: Math.round(webhookSuccessRate * 100) / 100
    }
  }
}

// Export singleton instance
export const queueManager = new QueueManager()