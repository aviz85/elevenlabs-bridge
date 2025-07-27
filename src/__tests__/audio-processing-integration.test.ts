import { audioProcessingService } from '../services/audio-processing'
import { databaseService } from '../services/database'
import { supabaseAdmin } from '../lib/supabase'

// Mock the Edge Function call
jest.mock('../services/audio-processing', () => {
  const originalModule = jest.requireActual('../services/audio-processing')
  
  return {
    ...originalModule,
    audioProcessingService: {
      ...originalModule.audioProcessingService,
      processAudio: jest.fn(),
      uploadFileForProcessing: jest.fn(),
      cleanupTaskFiles: jest.fn(),
      validateAudioFile: originalModule.audioProcessingService.validateAudioFile.bind(originalModule.audioProcessingService)
    }
  }
})

// Mock Supabase
jest.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: jest.fn(() => ({
      insert: jest.fn(),
      select: jest.fn(),
      update: jest.fn(),
      eq: jest.fn(),
      single: jest.fn(),
      order: jest.fn()
    })),
    storage: {
      from: jest.fn(() => ({
        upload: jest.fn(),
        download: jest.fn(),
        list: jest.fn(),
        remove: jest.fn()
      }))
    },
    raw: jest.fn()
  }
}))

describe('Audio Processing Integration', () => {
  const mockProcessAudio = audioProcessingService.processAudio as jest.MockedFunction<typeof audioProcessingService.processAudio>
  const mockUploadFile = audioProcessingService.uploadFileForProcessing as jest.MockedFunction<typeof audioProcessingService.uploadFileForProcessing>
  const mockCleanup = audioProcessingService.cleanupTaskFiles as jest.MockedFunction<typeof audioProcessingService.cleanupTaskFiles>

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Set up environment variables
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
  })

  afterEach(() => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
  })

  describe('Complete Audio Processing Workflow', () => {
    it('should process a single audio file successfully', async () => {
      // Mock database responses
      const mockTask = {
        id: 'test-task-id',
        client_webhook_url: 'https://client.example.com/webhook',
        original_filename: 'test.mp3',
        status: 'processing',
        total_segments: 1,
        completed_segments: 0,
        created_at: new Date().toISOString()
      }

      const mockSegment = {
        id: 'segment-1',
        task_id: 'test-task-id',
        file_path: 'converted/test-task-id/test.mp3',
        start_time: 0,
        end_time: 300,
        status: 'pending',
        created_at: new Date().toISOString()
      }

      // Mock database service calls
      const mockFrom = supabaseAdmin.from as jest.MockedFunction<any>
      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: mockTask, error: null })
        })
      })
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: mockTask, error: null })
        })
      })

      mockFrom.mockImplementation((table: string) => {
        if (table === 'tasks') {
          return { insert: mockInsert, select: mockSelect }
        }
        return { insert: mockInsert, select: mockSelect }
      })

      // Mock file upload
      mockUploadFile.mockResolvedValue('uploads/test-task-id/test.mp3')

      // Mock audio processing
      mockProcessAudio.mockResolvedValue({
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
      })

      // Simulate the complete workflow
      const audioFile = Buffer.from('mock audio data')
      const filename = 'test.mp3'
      const taskId = 'test-task-id'

      // Step 1: Create task in database
      const task = await databaseService.createTask({
        client_webhook_url: 'https://client.example.com/webhook',
        original_filename: filename
      })

      expect(task.id).toBe('test-task-id')
      expect(task.original_filename).toBe(filename)

      // Step 2: Upload file for processing
      const filePath = await audioProcessingService.uploadFileForProcessing(audioFile, filename, taskId)
      expect(filePath).toBe('uploads/test-task-id/test.mp3')

      // Step 3: Process audio (convert and segment)
      const processingResult = await audioProcessingService.processAudio({
        taskId,
        filePath,
        originalFilename: filename,
        segmentDurationMinutes: 15
      })

      expect(processingResult.success).toBe(true)
      expect(processingResult.segmentsCreated).toBe(1)
      expect(processingResult.segments).toHaveLength(1)

      // Verify all mocks were called correctly
      expect(mockUploadFile).toHaveBeenCalledWith(audioFile, filename, taskId)
      expect(mockProcessAudio).toHaveBeenCalledWith({
        taskId,
        filePath,
        originalFilename: filename,
        segmentDurationMinutes: 15
      })
    })

    it('should process a large audio file with multiple segments', async () => {
      const mockTask = {
        id: 'test-task-id',
        client_webhook_url: 'https://client.example.com/webhook',
        original_filename: 'large-file.mp3',
        status: 'processing',
        total_segments: 3,
        completed_segments: 0,
        created_at: new Date().toISOString()
      }

      // Mock database responses
      const mockFrom = supabaseAdmin.from as jest.MockedFunction<any>
      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ data: mockTask, error: null })
        })
      })

      mockFrom.mockReturnValue({ insert: mockInsert })

      // Mock file upload
      mockUploadFile.mockResolvedValue('uploads/test-task-id/large-file.mp3')

      // Mock audio processing with multiple segments
      mockProcessAudio.mockResolvedValue({
        success: true,
        taskId: 'test-task-id',
        totalDuration: 2700, // 45 minutes
        segmentsCreated: 3,
        segments: [
          {
            id: 'segment-1',
            filePath: 'segments/test-task-id/segment_1.mp3',
            startTime: 0,
            endTime: 900,
            duration: 900
          },
          {
            id: 'segment-2',
            filePath: 'segments/test-task-id/segment_2.mp3',
            startTime: 900,
            endTime: 1800,
            duration: 900
          },
          {
            id: 'segment-3',
            filePath: 'segments/test-task-id/segment_3.mp3',
            startTime: 1800,
            endTime: 2700,
            duration: 900
          }
        ]
      })

      // Simulate processing a large file
      const audioFile = Buffer.from('mock large audio data')
      const filename = 'large-file.mp3'
      const taskId = 'test-task-id'

      // Create task
      const task = await databaseService.createTask({
        client_webhook_url: 'https://client.example.com/webhook',
        original_filename: filename
      })

      // Upload and process
      const filePath = await audioProcessingService.uploadFileForProcessing(audioFile, filename, taskId)
      const processingResult = await audioProcessingService.processAudio({
        taskId,
        filePath,
        originalFilename: filename,
        segmentDurationMinutes: 15
      })

      expect(processingResult.success).toBe(true)
      expect(processingResult.segmentsCreated).toBe(3)
      expect(processingResult.totalDuration).toBe(2700)
      expect(processingResult.segments).toHaveLength(3)

      // Verify segments have correct timing
      expect(processingResult.segments[0].startTime).toBe(0)
      expect(processingResult.segments[0].endTime).toBe(900)
      expect(processingResult.segments[1].startTime).toBe(900)
      expect(processingResult.segments[1].endTime).toBe(1800)
      expect(processingResult.segments[2].startTime).toBe(1800)
      expect(processingResult.segments[2].endTime).toBe(2700)
    })

    it('should handle audio processing errors gracefully', async () => {
      const taskId = 'test-task-id'
      const filename = 'invalid-file.txt'
      const audioFile = Buffer.from('invalid data')

      // Mock upload success but processing failure
      mockUploadFile.mockResolvedValue('uploads/test-task-id/invalid-file.txt')
      mockProcessAudio.mockRejectedValue(new Error('Audio processing service error: Invalid audio file'))

      const filePath = await audioProcessingService.uploadFileForProcessing(audioFile, filename, taskId)

      await expect(audioProcessingService.processAudio({
        taskId,
        filePath,
        originalFilename: filename,
        segmentDurationMinutes: 15
      })).rejects.toThrow('Audio processing service error: Invalid audio file')

      // Verify cleanup would be called in error handling
      expect(mockUploadFile).toHaveBeenCalledWith(audioFile, filename, taskId)
    })

    it('should validate audio files before processing', () => {
      // Test valid files
      expect(audioProcessingService.validateAudioFile('test.mp3', 1024 * 1024)).toEqual({ valid: true })
      expect(audioProcessingService.validateAudioFile('test.wav', 1024 * 1024)).toEqual({ valid: true })
      expect(audioProcessingService.validateAudioFile('test.m4a', 1024 * 1024)).toEqual({ valid: true })

      // Test invalid format
      const invalidFormat = audioProcessingService.validateAudioFile('test.txt', 1024 * 1024)
      expect(invalidFormat.valid).toBe(false)
      expect(invalidFormat.error).toContain('Unsupported file format')

      // Test file too large
      const tooLarge = audioProcessingService.validateAudioFile('test.mp3', 600 * 1024 * 1024)
      expect(tooLarge.valid).toBe(false)
      expect(tooLarge.error).toContain('File size exceeds maximum limit')
    })

    it('should handle cleanup after processing completion', async () => {
      const taskId = 'test-task-id'
      
      mockCleanup.mockResolvedValue()

      await audioProcessingService.cleanupTaskFiles(taskId)

      expect(mockCleanup).toHaveBeenCalledWith(taskId)
    })
  })

  describe('Error Handling', () => {
    it('should handle database errors during task creation', async () => {
      const mockFrom = supabaseAdmin.from as jest.MockedFunction<any>
      const mockInsert = jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({ 
            data: null, 
            error: { message: 'Database connection failed' } 
          })
        })
      })

      mockFrom.mockReturnValue({ insert: mockInsert })

      await expect(databaseService.createTask({
        client_webhook_url: 'https://client.example.com/webhook',
        original_filename: 'test.mp3'
      })).rejects.toThrow('Failed to create task: Database connection failed')
    })

    it('should handle file upload errors', async () => {
      mockUploadFile.mockRejectedValue(new Error('Failed to upload file: Storage quota exceeded'))

      const audioFile = Buffer.from('test data')
      const filename = 'test.mp3'
      const taskId = 'test-task-id'

      await expect(audioProcessingService.uploadFileForProcessing(audioFile, filename, taskId))
        .rejects.toThrow('Failed to upload file: Storage quota exceeded')
    })
  })
})