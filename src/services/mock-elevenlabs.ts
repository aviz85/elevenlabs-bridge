import { ElevenLabsTranscriptionResult, ElevenLabsTranscriptionOptions } from '@/types'
import { logger } from '@/lib/logger'
import { ExternalServiceError } from '@/lib/errors'

export class MockElevenLabsService {
  private mockTranscriptions = [
    "Hello, this is a sample transcription from the first segment of your audio file.",
    "This is the second segment containing more spoken content that has been transcribed.",
    "Here we have the third segment with additional dialogue and conversation.",
    "The fourth segment continues with more transcribed speech content.",
    "This is the final segment completing the full transcription of your audio file."
  ]

  /**
   * Mock transcription request to ElevenLabs
   * In real implementation, this would call the actual ElevenLabs API
   */
  async transcribeAudio(
    filePath: string, 
    options: ElevenLabsTranscriptionOptions
  ): Promise<{ taskId: string }> {
    logger.info('Mock: Starting ElevenLabs transcription', { filePath, options })
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000))
    
    // Generate mock task ID
    const taskId = `elevenlabs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    // Simulate async processing - complete after random delay
    this.simulateAsyncTranscription(taskId, filePath)
    
    logger.info('Mock: ElevenLabs transcription started', { taskId, filePath })
    return { taskId }
  }

  /**
   * Simulate async transcription completion
   * In real implementation, this would be handled by ElevenLabs webhooks
   */
  private async simulateAsyncTranscription(taskId: string, filePath: string): Promise<void> {
    // Random delay between 3-10 seconds to simulate processing
    const delay = 3000 + Math.random() * 7000
    
    setTimeout(async () => {
      try {
        // Generate mock transcription result
        const result = this.generateMockTranscriptionResult(filePath)
        
        // In real implementation, this would be sent via webhook
        // For now, we'll just log it
        logger.info('Mock: ElevenLabs transcription completed', { 
          taskId, 
          result: { text: result.text.substring(0, 100) + '...' }
        })
        
        // Simulate webhook call to our server
        await this.simulateWebhookCall(taskId, result)
        
      } catch (error) {
        logger.error('Mock: ElevenLabs transcription failed', error as Error, { taskId })
        await this.simulateWebhookCall(taskId, null, 'Transcription failed')
      }
    }, delay)
  }

  /**
   * Generate mock transcription result
   */
  private generateMockTranscriptionResult(filePath: string): ElevenLabsTranscriptionResult {
    // Extract segment info from file path for more realistic content
    const segmentMatch = filePath.match(/segment-(\d+)/)
    const segmentIndex = segmentMatch ? parseInt(segmentMatch[1]) - 1 : 0
    
    const baseText = this.mockTranscriptions[segmentIndex % this.mockTranscriptions.length]
    
    // Add some variation
    const variations = [
      " The audio quality is clear and the speech is well articulated.",
      " There are some background sounds but the main speech is clearly audible.",
      " The speaker maintains a consistent pace throughout this segment.",
      " This portion contains important information that has been accurately transcribed.",
      " The transcription captures the nuances and tone of the original speech."
    ]
    
    const text = baseText + variations[Math.floor(Math.random() * variations.length)]
    
    return {
      text,
      language_code: 'en',
      language_probability: 0.95 + Math.random() * 0.05,
      words: this.generateMockWords(text)
    }
  }

  /**
   * Generate mock word-level timing data
   */
  private generateMockWords(text: string): Array<{
    text: string
    start: number
    end: number
    type: 'word' | 'spacing'
    speaker_id?: string
  }> {
    const words = text.split(' ')
    const result: Array<{
      text: string
      start: number
      end: number
      type: 'word' | 'spacing'
      speaker_id?: string
    }> = []
    
    let currentTime = 0
    
    words.forEach((word, index) => {
      // Word timing
      const wordDuration = 0.3 + Math.random() * 0.4 // 0.3-0.7 seconds per word
      result.push({
        text: word,
        start: currentTime,
        end: currentTime + wordDuration,
        type: 'word',
        speaker_id: 'speaker_0'
      })
      
      currentTime += wordDuration
      
      // Space timing (except for last word)
      if (index < words.length - 1) {
        const spaceDuration = 0.1 + Math.random() * 0.2 // 0.1-0.3 seconds for space
        result.push({
          text: ' ',
          start: currentTime,
          end: currentTime + spaceDuration,
          type: 'spacing',
          speaker_id: 'speaker_0'
        })
        currentTime += spaceDuration
      }
    })
    
    return result
  }

  /**
   * Simulate webhook call to our server
   * In real implementation, ElevenLabs would call our webhook endpoint
   */
  private async simulateWebhookCall(
    taskId: string, 
    result: ElevenLabsTranscriptionResult | null, 
    error?: string
  ): Promise<void> {
    try {
      const webhookUrl = `${process.env.WEBHOOK_BASE_URL || 'http://localhost:3000'}/api/webhook/elevenlabs`
      
      const payload = {
        task_id: taskId,
        status: result ? 'completed' : 'failed',
        result,
        error
      }
      
      logger.info('Mock: Simulating webhook call', { webhookUrl, taskId, status: payload.status })
      
      // Actually make the webhook call to our own server for realistic testing
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload)
        })
        
        if (response.ok) {
          logger.info('Mock: Webhook call successful', { taskId, status: response.status })
        } else {
          logger.warn('Mock: Webhook call failed', { taskId, status: response.status })
        }
      } catch (fetchError) {
        logger.warn('Mock: Could not reach webhook endpoint (server may not be running)', { taskId })
        // This is expected in testing scenarios where the server isn't running
      }
      
    } catch (error) {
      logger.error('Mock: Failed to simulate webhook call', error as Error, { taskId })
    }
  }

  /**
   * Mock API key validation
   */
  async validateApiKey(apiKey: string): Promise<boolean> {
    logger.info('Mock: Validating ElevenLabs API key')
    
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 200))
    
    // Mock validation - accept any non-empty key for testing
    const isValid = apiKey && apiKey.length > 10
    
    logger.info('Mock: API key validation result', { isValid })
    return isValid
  }
}

export const mockElevenLabsService = new MockElevenLabsService()