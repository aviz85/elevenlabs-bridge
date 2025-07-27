import { AudioProcessingService } from '../audio-processing'
import { supabaseAdmin } from '../../lib/supabase'

// Mock Supabase
jest.mock('../../lib/supabase', () => ({
  supabaseAdmin: {
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn(),
        download: jest.fn(),
        list: jest.fn(),
        remove: jest.fn()
      }))
    }
  }
}))

// Mock fetch for Edge Function calls
global.fetch = jest.fn()

describe('AudioProcessingService', () => {
  let service: AudioProcessingService
  const mockFetch = fetch as jest.MockedFunction<typeof fetch>
  const mockStorage = supabaseAdmin.storage.from as jest.MockedFunction<any>

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Set required environment variables
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
    
    service = new AudioProcessingService()
  })

  afterEach(() => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  describe('constructor', () => {
    it('should throw error if SUPABASE_URL is not set', () => {
      delete process.env.SUPABASE_URL
      expect(() => new AudioProcessingService()).toThrow('SUPABASE_URL environment variable is required')
    })

    it('should initialize with correct Edge Function URL', () => {
      expect(service).toBeInstanceOf(AudioProcessingService)
    })
  })

  describe('processAudio', () => {
    const mockRequest = {
      taskId: 'test-task-id',
      filePath: 'uploads/test-task-id/test.mp3',
      originalFilename: 'test.mp3',
      segmentDurationMinutes: 15
    }

    it('should successfully process audio and return result', async () => {
      const mockResponse = {
        success: true,
        taskId: 'test-task-id',
        totalDuration: 300,
        segmentsCreated: 1,
        segments: [{
          id: 'segment-1',
          filePath: 'converted/test-task-id/test.mp3',
          startTime: 0,
          endTime: 300,
          duration: 300
        }]
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(mockResponse)
      } as any)

      const result = await service.processAudio(mockRequest)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.supabase.co/functions/v1/audio-processor',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-service-role-key'
          },
          body: JSON.stringify(mockRequest)
        }
      )

      expect(result).toEqual(mockResponse)
    })

    it('should handle Edge Function errors', async () => {
      const errorResponse = { error: 'Processing failed' }
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
        json: jest.fn().mockResolvedValue(errorResponse)
      } as any)

      await expect(service.processAudio(mockRequest)).rejects.toThrow('Audio processing failed: Processing failed')
    })

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(service.processAudio(mockRequest)).rejects.toThrow('Audio processing service error: Network error')
    })

    it('should handle malformed JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Bad Request',
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON'))
      } as any)

      await expect(service.processAudio(mockRequest)).rejects.toThrow('Audio processing service error: Audio processing failed: Unknown error')
    })
  })

  describe('uploadFileForProcessing', () => {
    it('should successfully upload file to storage', async () => {
      const mockFile = Buffer.from('test audio data')
      const filename = 'test.mp3'
      const taskId = 'test-task-id'

      const mockUpload = jest.fn().mockResolvedValue({ error: null })
      mockStorage.mockReturnValue({ upload: mockUpload })

      const result = await service.uploadFileForProcessing(mockFile, filename, taskId)

      expect(mockStorage).toHaveBeenCalledWith('audio-temp')
      expect(mockUpload).toHaveBeenCalledWith(
        'uploads/test-task-id/test.mp3',
        mockFile,
        {
          contentType: 'audio/mpeg',
          upsert: true
        }
      )
      expect(result).toBe('uploads/test-task-id/test.mp3')
    })

    it('should handle upload errors', async () => {
      const mockFile = Buffer.from('test audio data')
      const filename = 'test.mp3'
      const taskId = 'test-task-id'

      const mockUpload = jest.fn().mockResolvedValue({ error: { message: 'Upload failed' } })
      mockStorage.mockReturnValue({ upload: mockUpload })

      await expect(service.uploadFileForProcessing(mockFile, filename, taskId))
        .rejects.toThrow('Failed to upload file: Upload failed')
    })
  })

  describe('downloadSegment', () => {
    it('should successfully download segment from storage', async () => {
      const filePath = 'segments/test-task-id/segment_1.mp3'
      const mockData = {
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(16))
      }

      const mockDownload = jest.fn().mockResolvedValue({ data: mockData, error: null })
      mockStorage.mockReturnValue({ download: mockDownload })

      const result = await service.downloadSegment(filePath)

      expect(mockStorage).toHaveBeenCalledWith('audio-temp')
      expect(mockDownload).toHaveBeenCalledWith(filePath)
      expect(result).toBeInstanceOf(Buffer)
    })

    it('should handle download errors', async () => {
      const filePath = 'segments/test-task-id/segment_1.mp3'

      const mockDownload = jest.fn().mockResolvedValue({ data: null, error: { message: 'File not found' } })
      mockStorage.mockReturnValue({ download: mockDownload })

      await expect(service.downloadSegment(filePath))
        .rejects.toThrow('Failed to download segment: File not found')
    })
  })

  describe('cleanupTaskFiles', () => {
    it('should successfully clean up all task files', async () => {
      const taskId = 'test-task-id'

      const mockList = jest.fn()
        .mockResolvedValueOnce({ data: [{ name: 'test.mp3' }], error: null }) // uploads
        .mockResolvedValueOnce({ data: [{ name: 'test.mp3' }], error: null }) // converted
        .mockResolvedValueOnce({ data: [{ name: 'segment_1.mp3' }], error: null }) // segments

      const mockRemove = jest.fn().mockResolvedValue({ error: null })

      mockStorage.mockReturnValue({ list: mockList, remove: mockRemove })

      await service.cleanupTaskFiles(taskId)

      expect(mockList).toHaveBeenCalledTimes(3)
      expect(mockList).toHaveBeenCalledWith('uploads/test-task-id')
      expect(mockList).toHaveBeenCalledWith('converted/test-task-id')
      expect(mockList).toHaveBeenCalledWith('segments/test-task-id')

      expect(mockRemove).toHaveBeenCalledTimes(3)
      expect(mockRemove).toHaveBeenCalledWith(['uploads/test-task-id/test.mp3'])
      expect(mockRemove).toHaveBeenCalledWith(['converted/test-task-id/test.mp3'])
      expect(mockRemove).toHaveBeenCalledWith(['segments/test-task-id/segment_1.mp3'])
    })

    it('should handle cleanup errors gracefully', async () => {
      const taskId = 'test-task-id'

      const mockList = jest.fn().mockResolvedValue({ data: null, error: { message: 'List failed' } })
      mockStorage.mockReturnValue({ list: mockList })

      // Should not throw error
      await expect(service.cleanupTaskFiles(taskId)).resolves.toBeUndefined()
    })
  })

  describe('validateAudioFile', () => {
    it('should validate supported audio formats', () => {
      const supportedFormats = ['test.mp3', 'test.mp4', 'test.wav', 'test.m4a', 'test.aac', 'test.ogg', 'test.flac']
      
      supportedFormats.forEach(filename => {
        const result = service.validateAudioFile(filename, 1024 * 1024) // 1MB
        expect(result.valid).toBe(true)
        expect(result.error).toBeUndefined()
      })
    })

    it('should reject unsupported formats', () => {
      const result = service.validateAudioFile('test.txt', 1024 * 1024)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('Unsupported file format')
    })

    it('should reject files that are too large', () => {
      const largeFileSize = 600 * 1024 * 1024 // 600MB (exceeds 500MB limit)
      const result = service.validateAudioFile('test.mp3', largeFileSize)
      expect(result.valid).toBe(false)
      expect(result.error).toContain('File size exceeds maximum limit')
    })

    it('should handle case-insensitive file extensions', () => {
      const result = service.validateAudioFile('test.MP3', 1024 * 1024)
      expect(result.valid).toBe(true)
    })
  })

  describe('getContentType', () => {
    it('should return correct content types for supported formats', () => {
      const service = new AudioProcessingService()
      
      // Access private method for testing
      const getContentType = (service as any).getContentType.bind(service)
      
      expect(getContentType('test.mp3')).toBe('audio/mpeg')
      expect(getContentType('test.mp4')).toBe('video/mp4')
      expect(getContentType('test.wav')).toBe('audio/wav')
      expect(getContentType('test.m4a')).toBe('audio/mp4')
      expect(getContentType('test.aac')).toBe('audio/aac')
      expect(getContentType('test.ogg')).toBe('audio/ogg')
      expect(getContentType('test.flac')).toBe('audio/flac')
    })

    it('should return default content type for unknown formats', () => {
      const service = new AudioProcessingService()
      const getContentType = (service as any).getContentType.bind(service)
      
      expect(getContentType('test.unknown')).toBe('application/octet-stream')
    })
  })
})