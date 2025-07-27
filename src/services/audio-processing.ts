import { supabaseAdmin } from '../lib/supabase'

export interface AudioProcessingRequest {
  taskId: string
  filePath: string
  originalFilename: string
  segmentDurationMinutes?: number
}

export interface AudioSegment {
  id: string
  filePath: string
  startTime: number
  endTime: number
  duration: number
}

export interface AudioProcessingResult {
  success: boolean
  taskId: string
  totalDuration: number
  segmentsCreated: number
  segments: AudioSegment[]
  error?: string
}

/**
 * Service for handling audio processing operations using Supabase Edge Functions
 */
export class AudioProcessingService {
  private readonly edgeFunctionUrl: string

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL environment variable is required')
    }
    this.edgeFunctionUrl = `${supabaseUrl}/functions/v1/audio-processor`
  }

  /**
   * Process an audio file by converting to MP3 and splitting into segments if needed
   */
  async processAudio(request: AudioProcessingRequest): Promise<AudioProcessingResult> {
    try {
      const response = await fetch(this.edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify(request)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(`Audio processing failed: ${errorData.error || response.statusText}`)
      }

      const result = await response.json()
      return result as AudioProcessingResult
    } catch (error) {
      console.error('Error calling audio processing Edge Function:', error)
      throw new Error(`Audio processing service error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Upload a file to Supabase Storage for processing
   */
  async uploadFileForProcessing(file: Buffer, filename: string, taskId: string): Promise<string> {
    try {
      const filePath = `uploads/${taskId}/${filename}`
      
      const { error } = await supabaseAdmin.storage
        .from('audio-temp')
        .upload(filePath, file, {
          contentType: this.getContentType(filename),
          upsert: true
        })

      if (error) {
        throw new Error(`Failed to upload file: ${error.message}`)
      }

      return filePath
    } catch (error) {
      console.error('Error uploading file for processing:', error)
      throw error
    }
  }

  /**
   * Download a processed audio segment from storage
   */
  async downloadSegment(filePath: string): Promise<Buffer> {
    try {
      const { data, error } = await supabaseAdmin.storage
        .from('audio-temp')
        .download(filePath)

      if (error || !data) {
        throw new Error(`Failed to download segment: ${error?.message || 'No data returned'}`)
      }

      return Buffer.from(await data.arrayBuffer())
    } catch (error) {
      console.error('Error downloading segment:', error)
      throw error
    }
  }

  /**
   * Clean up temporary files for a task
   */
  async cleanupTaskFiles(taskId: string): Promise<void> {
    try {
      // List all files for this task
      const { data: files, error: listError } = await supabaseAdmin.storage
        .from('audio-temp')
        .list(`uploads/${taskId}`)

      if (listError) {
        console.error('Error listing files for cleanup:', listError)
        return
      }

      // Delete upload files
      if (files && files.length > 0) {
        const uploadPaths = files.map(file => `uploads/${taskId}/${file.name}`)
        const { error: deleteUploadError } = await supabaseAdmin.storage
          .from('audio-temp')
          .remove(uploadPaths)

        if (deleteUploadError) {
          console.error('Error deleting upload files:', deleteUploadError)
        }
      }

      // List and delete converted files
      const { data: convertedFiles, error: convertedListError } = await supabaseAdmin.storage
        .from('audio-temp')
        .list(`converted/${taskId}`)

      if (!convertedListError && convertedFiles && convertedFiles.length > 0) {
        const convertedPaths = convertedFiles.map(file => `converted/${taskId}/${file.name}`)
        const { error: deleteConvertedError } = await supabaseAdmin.storage
          .from('audio-temp')
          .remove(convertedPaths)

        if (deleteConvertedError) {
          console.error('Error deleting converted files:', deleteConvertedError)
        }
      }

      // List and delete segment files
      const { data: segmentFiles, error: segmentListError } = await supabaseAdmin.storage
        .from('audio-temp')
        .list(`segments/${taskId}`)

      if (!segmentListError && segmentFiles && segmentFiles.length > 0) {
        const segmentPaths = segmentFiles.map(file => `segments/${taskId}/${file.name}`)
        const { error: deleteSegmentError } = await supabaseAdmin.storage
          .from('audio-temp')
          .remove(segmentPaths)

        if (deleteSegmentError) {
          console.error('Error deleting segment files:', deleteSegmentError)
        }
      }

    } catch (error) {
      console.error('Error during file cleanup:', error)
    }
  }

  /**
   * Validate audio file format and size
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
   * Get appropriate content type for file
   */
  private getContentType(filename: string): string {
    const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'))
    
    const contentTypes: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.mp4': 'video/mp4',
      '.wav': 'audio/wav',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.ogg': 'audio/ogg',
      '.flac': 'audio/flac'
    }

    return contentTypes[extension] || 'application/octet-stream'
  }
}

// Export singleton instance
export const audioProcessingService = new AudioProcessingService()