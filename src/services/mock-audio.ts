import { logger } from '@/lib/logger'

export interface AudioInfo {
  duration: number // in seconds
  format: string
  size: number // in bytes
}

export interface AudioSegment {
  id: string
  startTime: number
  endTime: number
  duration: number
  filePath: string
}

export class MockAudioService {
  /**
   * Mock audio conversion - simulates converting any format to MP3
   */
  async convertToMp3(file: File): Promise<{ buffer: Buffer; filePath: string }> {
    logger.info('Mock: Converting file to MP3', { 
      filename: file.name, 
      size: file.size, 
      type: file.type 
    })

    // Simulate processing time
    await this.delay(1000)

    // Create a mock buffer (in real implementation, this would be the converted audio)
    const mockBuffer = Buffer.from(`mock-mp3-data-${Date.now()}`)
    const filePath = `converted/${Date.now()}-${file.name.replace(/\.[^/.]+$/, '')}.mp3`

    logger.info('Mock: File converted successfully', { filePath })
    return { buffer: mockBuffer, filePath }
  }

  /**
   * Mock audio duration detection
   */
  async getAudioDuration(file: File): Promise<number> {
    logger.info('Mock: Getting audio duration', { filename: file.name })

    // Simulate processing time
    await this.delay(500)

    // Mock duration based on file size (rough estimation)
    // Assume 1MB = ~60 seconds of audio (very rough)
    const estimatedDuration = Math.max(60, (file.size / (1024 * 1024)) * 60)
    
    logger.info('Mock: Audio duration calculated', { 
      filename: file.name, 
      duration: estimatedDuration 
    })

    return estimatedDuration
  }

  /**
   * Mock audio splitting into 15-minute segments
   */
  async splitAudio(filePath: string, totalDuration: number, segmentDuration: number = 900): Promise<AudioSegment[]> {
    logger.info('Mock: Splitting audio into segments', { 
      filePath, 
      totalDuration, 
      segmentDuration 
    })

    // Simulate processing time
    await this.delay(2000)

    const segments: AudioSegment[] = []
    let currentTime = 0
    let segmentIndex = 0

    while (currentTime < totalDuration) {
      const endTime = Math.min(currentTime + segmentDuration, totalDuration)
      const segment: AudioSegment = {
        id: `segment-${segmentIndex}`,
        startTime: currentTime,
        endTime: endTime,
        duration: endTime - currentTime,
        filePath: `${filePath}-segment-${segmentIndex}.mp3`
      }

      segments.push(segment)
      currentTime = endTime
      segmentIndex++
    }

    logger.info('Mock: Audio split into segments', { 
      filePath, 
      segmentCount: segments.length,
      segments: segments.map(s => ({ 
        id: s.id, 
        startTime: s.startTime, 
        endTime: s.endTime 
      }))
    })

    return segments
  }

  /**
   * Mock file upload to storage
   */
  async uploadToStorage(buffer: Buffer, filePath: string): Promise<string> {
    logger.info('Mock: Uploading file to storage', { filePath, size: buffer.length })

    // Simulate upload time
    await this.delay(1500)

    const storageUrl = `https://mock-storage.supabase.co/storage/v1/object/public/audio-files/${filePath}`
    
    logger.info('Mock: File uploaded successfully', { filePath, storageUrl })
    return storageUrl
  }

  /**
   * Mock file deletion from storage
   */
  async deleteFromStorage(filePath: string): Promise<void> {
    logger.info('Mock: Deleting file from storage', { filePath })

    // Simulate deletion time
    await this.delay(500)

    logger.info('Mock: File deleted successfully', { filePath })
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

export const mockAudioService = new MockAudioService()