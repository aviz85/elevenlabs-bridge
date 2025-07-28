import crypto from 'crypto'
import { Task, CombinedTranscription } from '@/types'
import { logger } from '@/lib/logger'
import { ExternalServiceError, ValidationError } from '@/lib/errors'
import { databaseService } from './database'

export interface WebhookPayload {
  taskId: string
  status: 'completed' | 'failed'
  transcription?: string
  originalFilename: string
  metadata?: {
    totalDuration: number
    languageCode: string
    confidence: number
    wordCount: number
    segmentCount: number
  }
  error?: string
  completedAt: string
  processingTimeMs?: number
}

export interface WebhookDeliveryResult {
  success: boolean
  statusCode?: number
  responseBody?: string
  error?: string
  attemptNumber: number
  deliveredAt: string
}

export interface WebhookDeliveryTracking {
  taskId: string
  webhookUrl: string
  attempts: WebhookDeliveryResult[]
  finalStatus: 'delivered' | 'failed' | 'pending'
  createdAt: string
  completedAt?: string
}

export class ClientWebhookService {
  private readonly maxRetries = 5
  private readonly timeoutMs = 30000 // 30 seconds
  private readonly signingSecret: string

  constructor() {
    this.signingSecret = process.env.WEBHOOK_SIGNING_SECRET || 'default-secret-change-in-production'
    
    if (this.signingSecret === 'default-secret-change-in-production') {
      logger.warn('Using default webhook signing secret - change in production!')
    }
  }

  /**
   * Send webhook notification to client with retry logic
   */
  async sendWebhookNotification(
    task: Task, 
    combinedTranscription?: CombinedTranscription,
    error?: string
  ): Promise<WebhookDeliveryTracking> {
    const startTime = Date.now()
    
    logger.info('Starting webhook delivery', {
      taskId: task.id,
      webhookUrl: task.client_webhook_url,
      status: error ? 'failed' : 'completed'
    })

    // Create webhook payload
    const payload = this.createWebhookPayload(task, combinedTranscription, error, startTime)
    
    // Initialize delivery tracking
    const deliveryTracking: WebhookDeliveryTracking = {
      taskId: task.id,
      webhookUrl: task.client_webhook_url,
      attempts: [],
      finalStatus: 'pending',
      createdAt: new Date().toISOString()
    }

    // Attempt delivery with exponential backoff
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.attemptWebhookDelivery(
          task.client_webhook_url,
          payload,
          attempt
        )

        deliveryTracking.attempts.push(result)

        if (result.success) {
          deliveryTracking.finalStatus = 'delivered'
          deliveryTracking.completedAt = new Date().toISOString()
          
          logger.info('Webhook delivered successfully', {
            taskId: task.id,
            attemptNumber: attempt,
            statusCode: result.statusCode,
            totalAttempts: attempt
          })
          
          break
        }

        // If this was the last attempt, mark as failed
        if (attempt === this.maxRetries) {
          deliveryTracking.finalStatus = 'failed'
          deliveryTracking.completedAt = new Date().toISOString()
          
          logger.error('Webhook delivery failed after all retries', {
            taskId: task.id,
            totalAttempts: this.maxRetries,
            lastError: result.error
          })
        } else {
          // Wait before next attempt (exponential backoff with jitter)
          const backoffMs = this.calculateBackoffDelay(attempt)
          logger.info('Webhook delivery failed, retrying', {
            taskId: task.id,
            attemptNumber: attempt,
            nextRetryInMs: backoffMs,
            error: result.error
          })
          
          await this.sleep(backoffMs)
        }

      } catch (error) {
        const errorResult: WebhookDeliveryResult = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          attemptNumber: attempt,
          deliveredAt: new Date().toISOString()
        }

        deliveryTracking.attempts.push(errorResult)

        logger.error('Webhook delivery attempt failed with exception', error as Error, {
          taskId: task.id,
          attemptNumber: attempt
        })

        if (attempt === this.maxRetries) {
          deliveryTracking.finalStatus = 'failed'
          deliveryTracking.completedAt = new Date().toISOString()
        } else {
          const backoffMs = this.calculateBackoffDelay(attempt)
          await this.sleep(backoffMs)
        }
      }
    }

    // Update task with webhook delivery status
    await this.updateTaskWithWebhookStatus(task.id, deliveryTracking)

    return deliveryTracking
  }

  /**
   * Create webhook payload with proper formatting
   */
  private createWebhookPayload(
    task: Task,
    combinedTranscription?: CombinedTranscription,
    error?: string,
    startTime?: number
  ): WebhookPayload {
    const processingTimeMs = startTime ? Date.now() - startTime : undefined

    const payload: WebhookPayload = {
      taskId: task.id,
      status: error ? 'failed' : 'completed',
      originalFilename: task.original_filename,
      completedAt: new Date().toISOString(),
      processingTimeMs
    }

    if (combinedTranscription) {
      payload.transcription = combinedTranscription.text
      payload.metadata = {
        totalDuration: combinedTranscription.metadata.totalDuration,
        languageCode: combinedTranscription.metadata.languageCode,
        confidence: combinedTranscription.metadata.confidence,
        wordCount: combinedTranscription.text.split(/\s+/).filter(word => word.length > 0).length,
        segmentCount: combinedTranscription.segments.length
      }
    }

    if (error) {
      payload.error = error
    }

    return payload
  }

  /**
   * Attempt single webhook delivery
   */
  private async attemptWebhookDelivery(
    webhookUrl: string,
    payload: WebhookPayload,
    attemptNumber: number
  ): Promise<WebhookDeliveryResult> {
    const deliveryResult: WebhookDeliveryResult = {
      success: false,
      attemptNumber,
      deliveredAt: new Date().toISOString()
    }

    try {
      // Create HMAC signature
      const signature = this.createHMACSignature(JSON.stringify(payload))
      
      // Create abort controller for timeout
      const abortController = new AbortController()
      const timeoutId = setTimeout(() => abortController.abort(), this.timeoutMs)

      // Make HTTP request
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ElevenLabs-Proxy-Server/1.0',
          'X-Webhook-Signature': signature,
          'X-Webhook-Timestamp': Date.now().toString(),
          'X-Webhook-Attempt': attemptNumber.toString()
        },
        body: JSON.stringify(payload),
        signal: abortController.signal
      })

      clearTimeout(timeoutId)

      deliveryResult.statusCode = response.status
      deliveryResult.responseBody = await response.text()

      // Consider 2xx status codes as successful
      if (response.status >= 200 && response.status < 300) {
        deliveryResult.success = true
      } else {
        deliveryResult.error = `HTTP ${response.status}: ${deliveryResult.responseBody}`
      }

    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          deliveryResult.error = `Request timeout after ${this.timeoutMs}ms`
        } else {
          deliveryResult.error = error.message
        }
      } else {
        deliveryResult.error = 'Unknown error occurred'
      }
    }

    return deliveryResult
  }

  /**
   * Create HMAC signature for webhook authentication
   */
  private createHMACSignature(payload: string): string {
    const hmac = crypto.createHmac('sha256', this.signingSecret)
    hmac.update(payload)
    return `sha256=${hmac.digest('hex')}`
  }

  /**
   * Verify HMAC signature (for testing purposes)
   */
  verifyHMACSignature(payload: string, signature: string): boolean {
    const expectedSignature = this.createHMACSignature(payload)
    
    // Ensure both signatures have the same length for timingSafeEqual
    if (signature.length !== expectedSignature.length) {
      return false
    }
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
  }

  /**
   * Calculate exponential backoff delay with jitter
   */
  private calculateBackoffDelay(attemptNumber: number): number {
    // Base delay: 1 second, exponential backoff with max of 60 seconds
    const baseDelayMs = 1000
    const maxDelayMs = 60000
    
    const exponentialDelay = Math.min(
      baseDelayMs * Math.pow(2, attemptNumber - 1),
      maxDelayMs
    )
    
    // Add jitter (±25% of the delay)
    const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1)
    
    return Math.max(exponentialDelay + jitter, baseDelayMs)
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Update task with webhook delivery status
   */
  private async updateTaskWithWebhookStatus(
    taskId: string,
    deliveryTracking: WebhookDeliveryTracking
  ): Promise<void> {
    try {
      // For now, we'll store webhook delivery info in the error_message field
      // In a production system, you might want a separate webhook_delivery_log table
      const webhookInfo = {
        webhookDeliveryStatus: deliveryTracking.finalStatus,
        webhookAttempts: deliveryTracking.attempts.length,
        webhookCompletedAt: deliveryTracking.completedAt
      }

      await databaseService.updateTask(taskId, {
        // Don't overwrite existing error messages if webhook delivery failed
        error_message: deliveryTracking.finalStatus === 'failed' 
          ? `Webhook delivery failed after ${deliveryTracking.attempts.length} attempts`
          : undefined
      })

      logger.info('Task updated with webhook delivery status', {
        taskId,
        webhookStatus: deliveryTracking.finalStatus,
        attempts: deliveryTracking.attempts.length
      })

    } catch (error) {
      logger.error('Failed to update task with webhook status', error as Error, { taskId })
    }
  }

  /**
   * Get webhook delivery configuration
   */
  getWebhookConfig(): {
    maxRetries: number
    timeoutMs: number
    signingEnabled: boolean
  } {
    return {
      maxRetries: this.maxRetries,
      timeoutMs: this.timeoutMs,
      signingEnabled: this.signingSecret !== 'default-secret-change-in-production'
    }
  }
}

export const clientWebhookService = new ClientWebhookService()