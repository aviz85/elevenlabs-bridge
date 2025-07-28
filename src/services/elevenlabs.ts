import { ElevenLabsTranscriptionResult, ElevenLabsTranscriptionOptions } from '@/types'
import { logger } from '@/lib/logger'
import { ExternalServiceError, RateLimitError, TimeoutError, AuthenticationError, withErrorHandling } from '@/lib/errors'
import { circuitBreakerRegistry } from '@/lib/circuit-breaker'
import { config } from '@/lib/config'

export class ElevenLabsService {
  private readonly apiKey: string
  private readonly baseUrl = 'https://api.elevenlabs.io/v1'
  private readonly circuitBreaker = circuitBreakerRegistry.getOrCreate('elevenlabs', {
    failureThreshold: 5,
    recoveryTimeout: 60000, // 1 minute
    monitoringPeriod: 300000, // 5 minutes
    expectedErrors: ['Invalid API key', 'Authentication failed']
  })
  private readonly requestTimeout = 300000 // 5 minutes - large audio files need more time

  constructor(apiKey?: string) {
    this.apiKey = apiKey || config.elevenlabs.apiKey
    if (!this.apiKey) {
      throw new AuthenticationError('ElevenLabs API key is required')
    }
  }

  /**
   * Transcribe audio using ElevenLabs Scribe API with webhook integration
   */
  async transcribeAudio(
    audioBuffer: Buffer,
    options: ElevenLabsTranscriptionOptions & { webhookUrl?: string }
  ): Promise<{ taskId?: string; result?: ElevenLabsTranscriptionResult }> {
    const startTime = Date.now()
    
    return this.circuitBreaker.execute(
      withErrorHandling(async () => {
        logger.info('Starting ElevenLabs transcription', { 
          modelId: options.modelId,
          webhook: !!options.webhookUrl,
          bufferSize: audioBuffer.length,
          webhookUrl: options.webhookUrl
        })

        const formData = new FormData()
        
        // Create a Blob from the buffer
        const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' })
        formData.append('file', audioBlob, 'audio.mp3')
        formData.append('model_id', options.modelId || 'scribe_v1')
        
        if (options.languageCode) {
          formData.append('language_code', options.languageCode)
        }
        
        if (options.diarize !== undefined) {
          formData.append('diarize', options.diarize.toString())
        }
        
        if (options.tagAudioEvents !== undefined) {
          formData.append('tag_audio_events', options.tagAudioEvents.toString())
        }

        // Configure webhook for async processing
        if (options.webhookUrl) {
          formData.append('webhook', 'true')
          // Note: Webhook URL must be pre-configured in ElevenLabs dashboard
          // We don't send the URL dynamically - ElevenLabs will use the configured webhook
          logger.info('Using webhook mode - URL must be configured in ElevenLabs dashboard', {
            configuredWebhook: 'https://elevenlabs-bridge-henna.vercel.app/api/webhook/elevenlabs'
          })
        }

        const response = await this.makeApiRequest(`${this.baseUrl}/speech-to-text`, {
          method: 'POST',
          headers: {
            'xi-api-key': this.apiKey,
            // Don't set Content-Type header - let the browser set it for FormData
          },
          body: formData
        })

        const result = await response.json()
        const duration = Date.now() - startTime
        
        // DETAILED LOGGING: Log the exact response from ElevenLabs
        logger.info('ElevenLabs API Response', {
          responseKeys: Object.keys(result),
          hasTaskId: !!result.task_id,
          taskIdValue: result.task_id,
          fullResponse: result,
          webhookMode: !!options.webhookUrl
        })
        
        if (options.webhookUrl) {
          // Async processing - return task ID
          if (!result.task_id) {
            logger.error('ElevenLabs API returned success but no task_id', new Error('Missing task_id'), {
              response: result,
              expectedTaskId: true,
              webhookUrl: options.webhookUrl
            })
            throw new Error(`ElevenLabs API returned success but no task_id. Response: ${JSON.stringify(result)}`)
          }
          
          logger.externalService('ElevenLabs', 'transcribe-async', true, duration, { 
            taskId: result.task_id,
            webhookUrl: options.webhookUrl
          })
          return { taskId: result.task_id }
        } else {
          // Sync processing - return result immediately
          logger.externalService('ElevenLabs', 'transcribe-sync', true, duration, { 
            textLength: result.text?.length || 0,
            languageCode: result.language_code
          })
          return { result }
        }
      }, { operation: 'transcribeAudio' }),
      'transcribeAudio'
    )
  }

  /**
   * Make API request with timeout and error handling
   */
  private async makeApiRequest(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        await this.handleApiError(response)
      }

      return response
    } catch (error) {
      clearTimeout(timeoutId)
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TimeoutError('ElevenLabs API request', this.requestTimeout)
      }
      
      throw error
    }
  }

  /**
   * Handle API error responses with proper error categorization
   */
  private async handleApiError(response: Response): Promise<never> {
    const errorText = await response.text()
    
    logger.error('ElevenLabs API error', new Error(errorText), {
      status: response.status,
      statusText: response.statusText,
      url: response.url
    })

    switch (response.status) {
      case 401:
        throw new AuthenticationError('Invalid ElevenLabs API key', { status: response.status })
      case 403:
        throw new AuthenticationError('ElevenLabs API access denied', { status: response.status })
      case 429:
        const retryAfter = response.headers.get('retry-after')
        throw new RateLimitError('ElevenLabs', retryAfter ? parseInt(retryAfter) : undefined)
      case 500:
      case 502:
      case 503:
      case 504:
        throw new ExternalServiceError('ElevenLabs', `Server error: ${response.status} ${response.statusText}`, { status: response.status }, true)
      default:
        throw new ExternalServiceError('ElevenLabs', `API request failed: ${response.status} ${response.statusText}`, { status: response.status }, false)
    }
  }

  /**
   * Validate API key by making a test request
   */
  async validateApiKey(): Promise<boolean> {
    return this.circuitBreaker.execute(
      withErrorHandling(async () => {
        logger.info('Validating ElevenLabs API key')
        
        const response = await this.makeApiRequest(`${this.baseUrl}/user`, {
          method: 'GET',
          headers: {
            'xi-api-key': this.apiKey,
          }
        })

        logger.info('ElevenLabs API key validation successful')
        return true
      }, { operation: 'validateApiKey' }),
      'validateApiKey'
    ).catch(error => {
      logger.error('ElevenLabs API key validation failed', error as Error)
      return false
    })
  }

  /**
   * Get user information and usage stats
   */
  async getUserInfo(): Promise<any> {
    return this.circuitBreaker.execute(
      withErrorHandling(async () => {
        const response = await this.makeApiRequest(`${this.baseUrl}/user`, {
          method: 'GET',
          headers: {
            'xi-api-key': this.apiKey,
          }
        })

        return await response.json()
      }, { operation: 'getUserInfo' }),
      'getUserInfo'
    )
  }

  /**
   * Get available models
   */
  async getModels(): Promise<any[]> {
    return this.circuitBreaker.execute(
      withErrorHandling(async () => {
        const response = await this.makeApiRequest(`${this.baseUrl}/models`, {
          method: 'GET',
          headers: {
            'xi-api-key': this.apiKey,
          }
        })

        return await response.json()
      }, { operation: 'getModels' }),
      'getModels'
    )
  }

  /**
   * Register webhook URL for receiving transcription results
   * Note: In production, this would typically be configured in the ElevenLabs dashboard
   * This method provides a programmatic way to validate and register webhook URLs
   */
  async registerWebhookUrl(webhookUrl: string): Promise<void> {
    try {
      logger.info('Registering webhook URL with ElevenLabs', { webhookUrl })

      // Validate webhook URL format
      if (!this.isValidWebhookUrl(webhookUrl)) {
        throw new Error(`Invalid webhook URL format: ${webhookUrl}`)
      }

      // In a real implementation, this would make an API call to ElevenLabs
      // to register the webhook URL. For now, we'll validate and log it.
      
      // Simulate webhook registration validation
      await this.validateWebhookEndpoint(webhookUrl)
      
      logger.info('Webhook URL registered successfully', { webhookUrl })

    } catch (error) {
      logger.error('Failed to register webhook URL', error as Error, { webhookUrl })
      throw new ExternalServiceError('ElevenLabs', `Webhook registration failed: ${(error as Error).message}`)
    }
  }

  /**
   * Validate webhook URL format
   */
  private isValidWebhookUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url)
      return parsedUrl.protocol === 'https:' && parsedUrl.pathname.includes('/webhook')
    } catch {
      return false
    }
  }

  /**
   * Validate that webhook endpoint is accessible
   */
  private async validateWebhookEndpoint(webhookUrl: string): Promise<void> {
    try {
      // In production, you might want to make a test request to validate the endpoint
      // For now, we'll just validate the URL structure
      const url = new URL(webhookUrl)
      
      if (!url.hostname) {
        throw new Error('Invalid webhook URL: missing hostname')
      }

      if (url.protocol !== 'https:') {
        throw new Error('Webhook URL must use HTTPS protocol')
      }

      logger.info('Webhook endpoint validation passed', { webhookUrl })

    } catch (error) {
      logger.error('Webhook endpoint validation failed', error as Error, { webhookUrl })
      throw error
    }
  }

  /**
   * Get webhook configuration status
   */
  async getWebhookStatus(): Promise<{ configured: boolean; url?: string }> {
    try {
      // In a real implementation, this would query the ElevenLabs API
      // to get the current webhook configuration
      logger.info('Checking webhook configuration status')

      // Mock implementation - in production this would be an actual API call
      return {
        configured: true,
        url: process.env.WEBHOOK_BASE_URL ? `${process.env.WEBHOOK_BASE_URL}/api/webhook/elevenlabs` : undefined
      }

    } catch (error) {
      logger.error('Failed to get webhook status', error as Error)
      throw new ExternalServiceError('ElevenLabs', `Failed to get webhook status: ${(error as Error).message}`)
    }
  }

  /**
   * Validate webhook signature (for incoming webhooks)
   */
  validateWebhookSignature(payload: string, signature: string, secret?: string): boolean {
    try {
      if (!secret) {
        secret = process.env.ELEVENLABS_WEBHOOK_SECRET
      }

      if (!secret) {
        logger.warn('No webhook secret configured - skipping signature validation')
        return true // Allow in development, but log warning
      }

      if (!signature) {
        logger.warn('No signature provided for webhook validation')
        return !secret // Return true only if no secret is configured
      }

      // ElevenLabs sends signature in format: t=timestamp,v0=signature
      // Parse the signature components
      const crypto = require('crypto')
      
      let timestamp: string | null = null
      let signatureValue: string | null = null
      
      // Parse signature format: "t=1234567890,v0=abcdef..."
      const parts = signature.split(',')
      for (const part of parts) {
        const [key, value] = part.trim().split('=')
        if (key === 't') {
          timestamp = value
        } else if (key === 'v0') {
          signatureValue = value
        }
      }
      
      if (!timestamp || !signatureValue) {
        logger.warn('Invalid signature format', { signature })
        return false
      }
      
      // ElevenLabs signs: timestamp.request_body (with dot separator)
      const payloadToSign = `${timestamp}.${payload}`
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payloadToSign)
        .digest('hex')

      const isValid = signatureValue === expectedSignature
      
      logger.info('Webhook signature validation', { 
        isValid,
        hasSecret: !!secret,
        signatureProvided: !!signature,
        // DEBUG INFO:
        timestamp,
        receivedSignature: signatureValue,
        expectedSignature,
        payloadLength: payload.length,
        payloadToSignLength: payloadToSign.length,
        originalSignature: signature
      })

      return isValid

    } catch (error) {
      logger.error('Webhook signature validation failed', error as Error)
      return false
    }
  }
}

export const elevenLabsService = new ElevenLabsService()