import { DatabaseService } from '../database'
import { DatabaseError } from '@/lib/errors'

// Mock Supabase
const mockSupabaseAdmin = {
  from: jest.fn(() => mockSupabaseAdmin),
  insert: jest.fn(() => mockSupabaseAdmin),
  update: jest.fn(() => mockSupabaseAdmin),
  select: jest.fn(() => mockSupabaseAdmin),
  eq: jest.fn(() => mockSupabaseAdmin),
  order: jest.fn(() => mockSupabaseAdmin),
  single: jest.fn(),
  raw: jest.fn((sql: string) => ({ sql }))
}

jest.mock('@/lib/supabase', () => ({
  supabaseAdmin: mockSupabaseAdmin
}))

describe('DatabaseService', () => {
  let databaseService: DatabaseService

  beforeEach(() => {
    databaseService = new DatabaseService()
    jest.clearAllMocks()
  })

  describe('createTask', () => {
    it('should create a task successfully', async () => {
      const taskData = {
        client_webhook_url: 'https://example.com/webhook',
        original_filename: 'test.mp3',
        total_segments: 2
      }

      const mockTask = {
        id: 'task-123',
        ...taskData,
        status: 'processing',
        completed_segments: 0,
        created_at: '2023-01-01T00:00:00Z'
      }

      mockSupabaseAdmin.single.mockResolvedValue({ data: mockTask, error: null })

      const result = await databaseService.createTask(taskData)

      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('tasks')
      expect(mockSupabaseAdmin.insert).toHaveBeenCalledWith(taskData)
      expect(mockSupabaseAdmin.select).toHaveBeenCalled()
      expect(mockSupabaseAdmin.single).toHaveBeenCalled()
      expect(result).toEqual(mockTask)
    })

    it('should throw DatabaseError on failure', async () => {
      const taskData = {
        client_webhook_url: 'https://example.com/webhook',
        original_filename: 'test.mp3'
      }

      mockSupabaseAdmin.single.mockResolvedValue({
        data: null,
        error: { message: 'Insert failed' }
      })

      await expect(databaseService.createTask(taskData)).rejects.toThrow(DatabaseError)
      await expect(databaseService.createTask(taskData)).rejects.toThrow('Failed to create task: Insert failed')
    })
  })

  describe('getTask', () => {
    it('should get a task successfully', async () => {
      const taskId = 'task-123'
      const mockTask = {
        id: taskId,
        client_webhook_url: 'https://example.com/webhook',
        original_filename: 'test.mp3',
        status: 'processing'
      }

      mockSupabaseAdmin.single.mockResolvedValue({ data: mockTask, error: null })

      const result = await databaseService.getTask(taskId)

      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('tasks')
      expect(mockSupabaseAdmin.select).toHaveBeenCalledWith('*')
      expect(mockSupabaseAdmin.eq).toHaveBeenCalledWith('id', taskId)
      expect(mockSupabaseAdmin.single).toHaveBeenCalled()
      expect(result).toEqual(mockTask)
    })

    it('should return null when task not found', async () => {
      const taskId = 'nonexistent-task'

      mockSupabaseAdmin.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' } // Not found error code
      })

      const result = await databaseService.getTask(taskId)

      expect(result).toBeNull()
    })

    it('should throw DatabaseError on other errors', async () => {
      const taskId = 'task-123'

      mockSupabaseAdmin.single.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' }
      })

      await expect(databaseService.getTask(taskId)).rejects.toThrow(DatabaseError)
      await expect(databaseService.getTask(taskId)).rejects.toThrow('Failed to get task: Database connection failed')
    })
  })

  describe('updateTask', () => {
    it('should update a task successfully', async () => {
      const taskId = 'task-123'
      const updates = { status: 'completed' as const, completed_at: '2023-01-01T01:00:00Z' }
      const mockUpdatedTask = {
        id: taskId,
        client_webhook_url: 'https://example.com/webhook',
        original_filename: 'test.mp3',
        ...updates
      }

      mockSupabaseAdmin.single.mockResolvedValue({ data: mockUpdatedTask, error: null })

      const result = await databaseService.updateTask(taskId, updates)

      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('tasks')
      expect(mockSupabaseAdmin.update).toHaveBeenCalledWith(updates)
      expect(mockSupabaseAdmin.eq).toHaveBeenCalledWith('id', taskId)
      expect(mockSupabaseAdmin.select).toHaveBeenCalled()
      expect(mockSupabaseAdmin.single).toHaveBeenCalled()
      expect(result).toEqual(mockUpdatedTask)
    })

    it('should throw DatabaseError on failure', async () => {
      const taskId = 'task-123'
      const updates = { status: 'failed' as const }

      mockSupabaseAdmin.single.mockResolvedValue({
        data: null,
        error: { message: 'Update failed' }
      })

      await expect(databaseService.updateTask(taskId, updates)).rejects.toThrow(DatabaseError)
      await expect(databaseService.updateTask(taskId, updates)).rejects.toThrow('Failed to update task: Update failed')
    })
  })

  describe('createSegment', () => {
    it('should create a segment successfully', async () => {
      const segmentData = {
        task_id: 'task-123',
        file_path: 'segments/segment-0.mp3',
        start_time: 0,
        end_time: 900
      }

      const mockSegment = {
        id: 'segment-456',
        ...segmentData,
        status: 'pending',
        created_at: '2023-01-01T00:00:00Z'
      }

      mockSupabaseAdmin.single.mockResolvedValue({ data: mockSegment, error: null })

      const result = await databaseService.createSegment(segmentData)

      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('segments')
      expect(mockSupabaseAdmin.insert).toHaveBeenCalledWith(segmentData)
      expect(mockSupabaseAdmin.select).toHaveBeenCalled()
      expect(mockSupabaseAdmin.single).toHaveBeenCalled()
      expect(result).toEqual(mockSegment)
    })

    it('should throw DatabaseError on failure', async () => {
      const segmentData = {
        task_id: 'task-123',
        file_path: 'segments/segment-0.mp3',
        start_time: 0,
        end_time: 900
      }

      mockSupabaseAdmin.single.mockResolvedValue({
        data: null,
        error: { message: 'Insert failed' }
      })

      await expect(databaseService.createSegment(segmentData)).rejects.toThrow(DatabaseError)
      await expect(databaseService.createSegment(segmentData)).rejects.toThrow('Failed to create segment: Insert failed')
    })
  })

  describe('getSegmentsByTaskId', () => {
    it('should get segments ordered by start_time', async () => {
      const taskId = 'task-123'
      const mockSegments = [
        { id: 'segment-1', task_id: taskId, start_time: 0, end_time: 900 },
        { id: 'segment-2', task_id: taskId, start_time: 900, end_time: 1800 }
      ]

      // Mock the chain of method calls
      mockSupabaseAdmin.order.mockResolvedValue({ data: mockSegments, error: null })

      const result = await databaseService.getSegmentsByTaskId(taskId)

      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('segments')
      expect(mockSupabaseAdmin.select).toHaveBeenCalledWith('*')
      expect(mockSupabaseAdmin.eq).toHaveBeenCalledWith('task_id', taskId)
      expect(mockSupabaseAdmin.order).toHaveBeenCalledWith('start_time', { ascending: true })
      expect(result).toEqual(mockSegments)
    })

    it('should return empty array when no segments found', async () => {
      const taskId = 'task-123'

      mockSupabaseAdmin.order.mockResolvedValue({ data: null, error: null })

      const result = await databaseService.getSegmentsByTaskId(taskId)

      expect(result).toEqual([])
    })

    it('should throw DatabaseError on failure', async () => {
      const taskId = 'task-123'

      mockSupabaseAdmin.order.mockResolvedValue({
        data: null,
        error: { message: 'Query failed' }
      })

      await expect(databaseService.getSegmentsByTaskId(taskId)).rejects.toThrow(DatabaseError)
      await expect(databaseService.getSegmentsByTaskId(taskId)).rejects.toThrow('Failed to get segments: Query failed')
    })
  })

  describe('updateSegment', () => {
    it('should update a segment successfully', async () => {
      const segmentId = 'segment-456'
      const updates = { status: 'completed' as const, transcription_text: 'Hello world' }
      const mockUpdatedSegment = {
        id: segmentId,
        task_id: 'task-123',
        file_path: 'segments/segment-0.mp3',
        ...updates
      }

      mockSupabaseAdmin.single.mockResolvedValue({ data: mockUpdatedSegment, error: null })

      const result = await databaseService.updateSegment(segmentId, updates)

      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('segments')
      expect(mockSupabaseAdmin.update).toHaveBeenCalledWith(updates)
      expect(mockSupabaseAdmin.eq).toHaveBeenCalledWith('id', segmentId)
      expect(mockSupabaseAdmin.select).toHaveBeenCalled()
      expect(mockSupabaseAdmin.single).toHaveBeenCalled()
      expect(result).toEqual(mockUpdatedSegment)
    })
  })

  describe('getSegmentByElevenLabsTaskId', () => {
    it('should get segment by ElevenLabs task ID', async () => {
      const elevenlabsTaskId = 'el-task-789'
      const mockSegment = {
        id: 'segment-456',
        task_id: 'task-123',
        elevenlabs_task_id: elevenlabsTaskId
      }

      mockSupabaseAdmin.single.mockResolvedValue({ data: mockSegment, error: null })

      const result = await databaseService.getSegmentByElevenLabsTaskId(elevenlabsTaskId)

      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('segments')
      expect(mockSupabaseAdmin.select).toHaveBeenCalledWith('*')
      expect(mockSupabaseAdmin.eq).toHaveBeenCalledWith('elevenlabs_task_id', elevenlabsTaskId)
      expect(mockSupabaseAdmin.single).toHaveBeenCalled()
      expect(result).toEqual(mockSegment)
    })

    it('should return null when segment not found', async () => {
      const elevenlabsTaskId = 'nonexistent-task'

      mockSupabaseAdmin.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' }
      })

      const result = await databaseService.getSegmentByElevenLabsTaskId(elevenlabsTaskId)

      expect(result).toBeNull()
    })
  })

  describe('incrementCompletedSegments', () => {
    it('should increment completed segments count', async () => {
      const taskId = 'task-123'
      const mockUpdatedTask = {
        id: taskId,
        completed_segments: 2,
        total_segments: 3
      }

      mockSupabaseAdmin.single.mockResolvedValue({ data: mockUpdatedTask, error: null })

      const result = await databaseService.incrementCompletedSegments(taskId)

      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('tasks')
      expect(mockSupabaseAdmin.update).toHaveBeenCalledWith({
        completed_segments: { sql: 'completed_segments + 1' }
      })
      expect(mockSupabaseAdmin.eq).toHaveBeenCalledWith('id', taskId)
      expect(mockSupabaseAdmin.select).toHaveBeenCalled()
      expect(mockSupabaseAdmin.single).toHaveBeenCalled()
      expect(result).toEqual(mockUpdatedTask)
    })
  })
})