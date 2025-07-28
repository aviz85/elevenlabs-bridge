import { logger } from '@/lib/logger'

export interface SegmentInfo {
  id: string
  filePath: string
  startTime: number
  endTime: number
  duration: number
}

export class AudioSplitter {
  /**
   * Create audio segments from a file path and duration
   */
  async createSegments(
    filePath: string, 
    totalDuration: number, 
    segmentDurationMinutes: number = 15
  ): Promise<SegmentInfo[]> {
    const segmentDurationSeconds = segmentDurationMinutes * 60
    
    logger.info('Creating audio segments', {
      filePath,
      totalDuration,
      segmentDurationSeconds
    })

    const segments: SegmentInfo[] = []
    let currentTime = 0
    let segmentIndex = 0

    while (currentTime < totalDuration) {
      const endTime = Math.min(currentTime + segmentDurationSeconds, totalDuration)
      const segment: SegmentInfo = {
        id: `segment-${segmentIndex}`,
        filePath: `${filePath}-segment-${segmentIndex}.mp3`,
        startTime: currentTime,
        endTime: endTime,
        duration: endTime - currentTime
      }

      segments.push(segment)
      currentTime = endTime
      segmentIndex++
    }

    logger.info('Audio segments created', {
      filePath,
      segmentCount: segments.length,
      totalDuration
    })

    return segments
  }

  /**
   * Validate audio file for segmentation
   */
  validateAudioFile(filename: string, fileSize: number): { valid: boolean; error?: string } {
    const supportedFormats = ['.mp3', '.mp4', '.wav', '.m4a', '.aac', '.ogg', '.flac']
    const maxFileSize = 500 * 1024 * 1024 // 500MB

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
   * Calculate optimal segment duration based on file duration
   */
  calculateOptimalSegmentDuration(totalDurationSeconds: number): number {
    // For files under 30 minutes, use single segment
    if (totalDurationSeconds <= 1800) {
      return Math.ceil(totalDurationSeconds / 60) // Convert to minutes
    }
    
    // For files under 2 hours, use 15-minute segments
    if (totalDurationSeconds <= 7200) {
      return 15
    }
    
    // For longer files, use 20-minute segments
    return 20
  }
}

// Export singleton instance
export const audioSplitter = new AudioSplitter()
