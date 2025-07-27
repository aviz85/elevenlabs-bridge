import { ElevenLabsTranscriptionResult, ElevenLabsTranscriptionOptions } from '@/types'
import { logger } from '@/lib/logger'
import { ExternalServiceError } from '@/lib/errors'
import { config } from '@/lib/config'

export class ElevenLabsService {
  private readonly apiKey: string
  private readonly baseUrl = 'https://api.elevenlabs.io/v1'

  constructor(apiKey?: string) {
    this.apiKey = apiKey || config.elevenlabs.apiKey
    if (!this.apiKey) {
      throw new Error('ElevenLabs API key is required')
    }
  }

  /**
   * Transcribe audio using ElevenLabs Scribe API
   */
  async transcribeAudio(
    audioBuffer: Buffer,
    options: ElevenLabsTranscriptionOptions & { webhookUrl?: string }
  ): Promise<{ taskId?: string; result?: ElevenLabsTranscriptionResult }> {
    logger.info('Starting ElevenLabs transcription', { 
      modelId: options.modelId,
      webhook: !!options.webhookUrl,
      bufferSize: audioBuffer.length
    })

    try {
      const formData = new FormData()
      
      // Create a Blob from the buffer
      const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' })
      formData.append('file', audioBlob, 'audio.mp3')
      formData.append('model_id', options.modelId)
      
      if (options.languageCode) {
        formData.append('language_code', options.languageCode)
      }
      
      if (options.diarize !== undefined) {
        formData.append('diarize', options.diarize.toString())
      }
      
      if (options.tagAudioEvents !== undefined) {
        formData.append('tag_audio_events', options.tagAudioEvents.toString())
      }

      // If webhook URL is provided, use async processing
      if (options.webhookUrl) {
        formData.append('webhook', 'true')
        // Note: ElevenLabs doesn't accept custom webhook URLs in the API call
        // The webhook URL needs to be configured in their dashboard
        // For now, we'll use the webhook parameter to enable async processing
      }

      const response = await fetch(`${this.baseUrl}/speech-to-text`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          // Don't set Content-Type header - let the browser set it for FormData
        },
        body: formData
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('ElevenLabs API error', new Error(errorText), {
          status: response.status,
          statusText: response.statusText
        })
        throw new ExternalServiceError('ElevenLabs', `API request failed: ${response.status} ${response.statusText}`)
      }

      const result = await response.json()
      
      if (options.webhookUrl) {
        // Async processing - return task ID
        logger.info('ElevenLabs async transcription started', { taskId: result.task_id })
        return { taskId: result.task_id }
      } else {
        // Sync processing - return result immediately
        logger.info('ElevenLabs sync transcription completed', { 
          textLength: result.text?.length || 0,
          languageCode: result.language_code
        })
        return { result }
      }

    } catch (error) {
      logger.error('ElevenLabs transcription failed', error as Error)
      if (error instanceof ExternalServiceError) {
        throw error
      }
      throw new ExternalServiceError('ElevenLabs', `Transcription failed: ${(error as Error).message}`)
    }
  }

  /**
   * Validate API key by making a test request
   */
  async validateApiKey(): Promise<boolean> {
    try {
      logger.info('Validating ElevenLabs API key')
      
      const response = await fetch(`${this.baseUrl}/user`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        }
      })

      const isValid = response.ok
      logger.info('ElevenLabs API key validation result', { isValid, status: response.status })
      
      return isValid
    } catch (error) {
      logger.error('ElevenLabs API key validation failed', error as Error)
      return false
    }
  }

  /**
   * Get user information and usage stats
   */
  async getUserInfo(): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/user`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        }
      })

      if (!response.ok) {
        throw new ExternalServiceError('ElevenLabs', `Failed to get user info: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      logger.error('Failed to get ElevenLabs user info', error as Error)
      throw error
    }
  }

  /**
   * Get available models
   */
  async getModels(): Promise<any[]> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        }
      })

      if (!response.ok) {
        throw new ExternalServiceError('ElevenLabs', `Failed to get models: ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      logger.error('Failed to get ElevenLabs models', error as Error)
      throw error
    }
  }
}

export const elevenLabsService = new ElevenLabsService()