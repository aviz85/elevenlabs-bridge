import { supabaseAdmin } from '@/lib/supabase'
import { Task, Segment } from '@/types'
import { DatabaseError } from '@/lib/errors'
import { logger } from '@/lib/logger'

export class DatabaseService {
  async createTask(data: {
    client_webhook_url: string
    original_filename: string
    converted_file_path?: string
    total_segments?: number
  }): Promise<Task> {
    try {
      const { data: task, error } = await supabaseAdmin
        .from('tasks')
        .insert(data)
        .select()
        .single()

      if (error) {
        throw new DatabaseError(`Failed to create task: ${error.message}`)
      }

      logger.info('Task created successfully', { taskId: task.id })
      return task
    } catch (error) {
      logger.error('Failed to create task', error as Error)
      throw error
    }
  }

  async getTask(taskId: string): Promise<Task | null> {
    try {
      const { data: task, error } = await supabaseAdmin
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return null // Task not found
        }
        throw new DatabaseError(`Failed to get task: ${error.message}`)
      }

      return task
    } catch (error) {
      logger.error('Failed to get task', error as Error, { taskId })
      throw error
    }
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<Task> {
    try {
      const { data: task, error } = await supabaseAdmin
        .from('tasks')
        .update(updates)
        .eq('id', taskId)
        .select()
        .single()

      if (error) {
        throw new DatabaseError(`Failed to update task: ${error.message}`)
      }

      logger.info('Task updated successfully', { taskId, updates })
      return task
    } catch (error) {
      logger.error('Failed to update task', error as Error, { taskId })
      throw error
    }
  }

  async createSegment(data: {
    task_id: string
    file_path: string
    start_time: number
    end_time: number
    elevenlabs_task_id?: string
  }): Promise<Segment> {
    try {
      const { data: segment, error } = await supabaseAdmin
        .from('segments')
        .insert(data)
        .select()
        .single()

      if (error) {
        throw new DatabaseError(`Failed to create segment: ${error.message}`)
      }

      logger.info('Segment created successfully', { segmentId: segment.id, taskId: data.task_id })
      return segment
    } catch (error) {
      logger.error('Failed to create segment', error as Error)
      throw error
    }
  }

  async getSegmentsByTaskId(taskId: string): Promise<Segment[]> {
    try {
      const { data: segments, error } = await supabaseAdmin
        .from('segments')
        .select('*')
        .eq('task_id', taskId)
        .order('start_time', { ascending: true })

      if (error) {
        throw new DatabaseError(`Failed to get segments: ${error.message}`)
      }

      return segments || []
    } catch (error) {
      logger.error('Failed to get segments', error as Error, { taskId })
      throw error
    }
  }

  async updateSegment(segmentId: string, updates: Partial<Segment>): Promise<Segment> {
    try {
      const { data: segment, error } = await supabaseAdmin
        .from('segments')
        .update(updates)
        .eq('id', segmentId)
        .select()
        .single()

      if (error) {
        throw new DatabaseError(`Failed to update segment: ${error.message}`)
      }

      logger.info('Segment updated successfully', { segmentId, updates })
      return segment
    } catch (error) {
      logger.error('Failed to update segment', error as Error, { segmentId })
      throw error
    }
  }

  async getSegmentByElevenLabsTaskId(elevenlabsTaskId: string): Promise<Segment | null> {
    try {
      const { data: segment, error } = await supabaseAdmin
        .from('segments')
        .select('*')
        .eq('elevenlabs_task_id', elevenlabsTaskId)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          return null // Segment not found
        }
        throw new DatabaseError(`Failed to get segment: ${error.message}`)
      }

      return segment
    } catch (error) {
      logger.error('Failed to get segment by ElevenLabs task ID', error as Error, { elevenlabsTaskId })
      throw error
    }
  }

  async incrementCompletedSegments(taskId: string): Promise<Task> {
    try {
      const { data: task, error } = await supabaseAdmin
        .from('tasks')
        .update({ 
          completed_segments: supabaseAdmin.raw('completed_segments + 1')
        })
        .eq('id', taskId)
        .select()
        .single()

      if (error) {
        throw new DatabaseError(`Failed to increment completed segments: ${error.message}`)
      }

      return task
    } catch (error) {
      logger.error('Failed to increment completed segments', error as Error, { taskId })
      throw error
    }
  }
}

export const databaseService = new DatabaseService()