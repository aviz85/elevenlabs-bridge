/**
 * Vercel-compatible audio processing service
 * Uses external services instead of FFmpeg for audio processing
 */

import { logger } from '@/lib/logger'

export interface VercelAudioSegment {
  id: string
  startTime: number
  endTime: number
  duration: number
  audioBuffer: Buffer
}

export class VercelAudioProcessingService {
  /**
   * Split audio into segments using time-based chunking
   * Since we can't use FFmpeg on Vercel, we'll use a different approach
   */
  async splitAudioByTime(
    audioBuffer: Buffer, 
    totalDurationSeconds: number,
    segmentDurationSeconds: number = 900 // 15 minutes
  ): Promise<VercelAudioSegment[]> {
    logger.info('Splitting audio by time', { 
      totalDuration: totalDurationSeconds,
      segmentDuration: segmentDurationSeconds 
    })

    const segments: VercelAudioSegment[] = []
    const numSegments = Math.ceil(totalDurationSeconds / segmentDurationSeconds)

    // For Vercel, we'll create logical segments without actual audio splitting
    // The actual splitting will be done by ElevenLabs API with start/end parameters
    for (let i = 0; i < numSegments; i++) {
      const startTime = i * segmentDurationSeconds
      const endTime = Math.min((i + 1) * segmentDurationSeconds, totalDurationSeconds)
      
      segments.push({
        id: crypto.randomUUID(),
        startTime,
        endTime,
        duration: endTime - startTime,
        audioBuffer // We'll send the full buffer and let ElevenLabs handle the segmentation
      })
    }

    logger.info('Audio segments created', { segmentCount: segments.length })
    return segments
  }

  /**
   * Get audio duration using a lightweight approach
   * Since we can't use FFprobe, we'll estimate or use metadata
   */
  async getAudioDuration(audioBuffer: Buffer, filename: string): Promise<number> {
    try {
      // For MP3 files, we can estimate duration from file size and bitrate
      if (filename.toLowerCase().endsWith('.mp3')) {
        // Rough estimation: 128kbps MP3 = ~16KB per second
        const estimatedDuration = audioBuffer.length / (16 * 1024)
        logger.info('Estimated MP3 duration', { 
          fileSize: audioBuffer.length,
          estimatedDuration 
        })
        return estimatedDuration
      }

      // For other formats, we'll use a default estimation
      // In production, you might want to use a service like Cloudinary or AWS MediaInfo
      const estimatedDuration = audioBuffer.length / (32 * 1024) // Conservative estimate
      logger.info('Estimated audio duration', { 
        fileSize: audioBuffer.length,
        estimatedDuration 
      })
      
      return estimatedDuration
    } catch (error) {
      logger.error('Error estimating audio duration', error as Error)
      // Return a default duration if estimation fails
      return 3600 // 1 hour default
    }
  }

  /**
   * Validate audio file for Vercel processing
   */
  validateAudioFile(filename: string, fileSize: number): { valid: boolean; error?: string } {
    const supportedFormats = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']
    const maxFileSize = 100 * 1024 * 1024 // 100MB for Vercel

    const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'))
    
    if (!supportedFormats.includes(extension)) {
      return {
        valid: false,
        error: `Unsupported file format. Supported formats: ${supportedFormats.join(', ')}`
      }
    }

    if (fileSize > maxFileSize) {
      return {
        valid: false,
        error: `File size exceeds maximum limit of ${maxFileSize / (1024 * 1024)}MB`
      }
    }

    return { valid: true }
  }

  /**
   * Convert audio to optimal format for ElevenLabs
   * Since we can't use FFmpeg, we'll rely on ElevenLabs to handle various formats
   */
  async optimizeForElevenLabs(audioBuffer: Buffer, filename: string): Promise<Buffer> {
    // For Vercel deployment, we'll pass through the original file
    // ElevenLabs API can handle most common audio formats directly
    logger.info('Optimizing audio for ElevenLabs', { 
      filename,
      originalSize: audioBuffer.length 
    })
    
    return audioBuffer
  }
}

export const vercelAudioProcessingService = new VercelAudioProcessingService()