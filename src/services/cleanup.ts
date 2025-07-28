import { supabaseAdmin } from '@/lib/supabase'
import { config } from '@/lib/config'
import { logger } from '@/lib/logger'
import { DatabaseError } from '@/lib/errors'
import { Task, Segment } from '@/types'

export interface CleanupOptions {
  maxRetries?: number
  retryDelayMs?: number
  batchSize?: number
}

export interface CleanupResult {
  tasksProcessed: number
  filesDeleted: number
  errors: Array<{
    taskId: string
    error: string
    retryCount: number
  }>
}

export interface CleanupStats {
  totalTasks: number
  completedTasks: number
  failedTasks: number
  filesDeleted: number
  errors: number
  lastCleanup: Date
}

export class CleanupService {
  private readonly defaultOptions: Required<CleanupOptions> = {
    maxRetries: 3,
    retryDelayMs: 1000,
    batchSize: 50
  }

  /**
   * Perform comprehensive cleanup of completed and failed tasks
   */
  async performCleanup(options: CleanupOptions = {}): Promise<CleanupResult> {
    const opts = { ...this.defaultOptions, ...options }
    const result: CleanupResult = {
      tasksProcessed: 0,
      filesDeleted: 0,
      errors: []
    }

    logger.info('Starting cleanup process', { options: opts })

    try {
      // Get tasks that need cleanup
      const tasksToCleanup = await this.getTasksForCleanup()
      logger.info(`Found ${tasksToCleanup.length} tasks for cleanup`)

      // Process tasks in batches
      for (let i = 0; i < tasksToCleanup.length; i += opts.batchSize) {
        const batch = tasksToCleanup.slice(i, i + opts.batchSize)
        await this.processBatch(batch, opts, result)
      }

      logger.info('Cleanup process completed', result)
      return result
    } catch (error) {
      logger.error('Cleanup process failed', error as Error)
      throw error
    }
  }

  /**
   * Clean up files for a specific task
   */
  async cleanupTask(taskId: string, options: CleanupOptions = {}): Promise<boolean> {
    const opts = { ...this.defaultOptions, ...options }
    
    try {
      logger.info('Starting task cleanup', { taskId })

      const task = await this.getTaskWithSegments(taskId)
      if (!task) {
        logger.warn('Task not found for cleanup', { taskId })
        return false
      }

      // Only cleanup completed or failed tasks
      if (task.status === 'processing') {
        logger.warn('Cannot cleanup task in processing state', { taskId, status: task.status })
        return false
      }

      const filesDeleted = await this.cleanupTaskFiles(task, opts)
      
      // Update task cleanup status
      await this.markTaskCleaned(taskId)
      
      logger.info('Task cleanup completed', { taskId, filesDeleted })
      return true
    } catch (error) {
      logger.error('Task cleanup failed', error as Error, { taskId })
      return false
    }
  }

  /**
   * Get cleanup statistics
   */
  async getCleanupStats(): Promise<CleanupStats> {
    try {
      const [totalTasks, completedTasks, failedTasks] = await Promise.all([
        this.getTaskCount(),
        this.getTaskCount('completed'),
        this.getTaskCount('failed')
      ])

      // Get last cleanup time from a metadata table or use current time
      const lastCleanup = new Date()

      return {
        totalTasks,
        completedTasks,
        failedTasks,
        filesDeleted: 0, // This would be tracked in a separate metrics table
        errors: 0,
        lastCleanup
      }
    } catch (error) {
      logger.error('Failed to get cleanup stats', error as Error)
      throw error
    }
  }

  /**
   * Schedule automatic cleanup
   */
  scheduleCleanup(): NodeJS.Timeout {
    const intervalMs = config.app.cleanupIntervalHours * 60 * 60 * 1000
    
    logger.info('Scheduling automatic cleanup', { 
      intervalHours: config.app.cleanupIntervalHours,
      intervalMs 
    })

    return setInterval(async () => {
      try {
        logger.info('Running scheduled cleanup')
        const result = await this.performCleanup()
        logger.info('Scheduled cleanup completed', result)
      } catch (error) {
        logger.error('Scheduled cleanup failed', error as Error)
      }
    }, intervalMs)
  }

  private async getTasksForCleanup(): Promise<Task[]> {
    try {
      // Get tasks that are completed or failed and older than cleanup interval
      const cutoffTime = new Date(Date.now() - (config.app.cleanupIntervalHours * 60 * 60 * 1000))
      
      const { data: tasks, error } = await supabaseAdmin
        .from('tasks')
        .select('*')
        .in('status', ['completed', 'failed'])
        .lt('created_at', cutoffTime.toISOString())
        .order('created_at', { ascending: true })

      if (error) {
        throw new DatabaseError(`Failed to get tasks for cleanup: ${error.message}`)
      }

      return tasks || []
    } catch (error) {
      logger.error('Failed to get tasks for cleanup', error as Error)
      throw error
    }
  }

  private async getTaskWithSegments(taskId: string): Promise<(Task & { segments: Segment[] }) | null> {
    try {
      const { data: task, error: taskError } = await supabaseAdmin
        .from('tasks')
        .select(`
          *,
          segments (*)
        `)
        .eq('id', taskId)
        .single()

      if (taskError) {
        if (taskError.code === 'PGRST116') {
          return null
        }
        throw new DatabaseError(`Failed to get task with segments: ${taskError.message}`)
      }

      return task
    } catch (error) {
      logger.error('Failed to get task with segments', error as Error, { taskId })
      throw error
    }
  }

  private async processBatch(
    tasks: Task[], 
    options: Required<CleanupOptions>, 
    result: CleanupResult
  ): Promise<void> {
    const promises = tasks.map(async (task) => {
      try {
        const taskWithSegments = await this.getTaskWithSegments(task.id)
        if (!taskWithSegments) {
          return
        }

        const filesDeleted = await this.cleanupTaskFiles(taskWithSegments, options)
        await this.markTaskCleaned(task.id)
        
        result.tasksProcessed++
        result.filesDeleted += filesDeleted
      } catch (error) {
        logger.error('Failed to cleanup task in batch', error as Error, { taskId: task.id })
        result.errors.push({
          taskId: task.id,
          error: (error as Error).message,
          retryCount: 0
        })
      }
    })

    await Promise.allSettled(promises)
  }

  private async cleanupTaskFiles(
    task: Task & { segments: Segment[] }, 
    options: Required<CleanupOptions>
  ): Promise<number> {
    let filesDeleted = 0
    const filesToDelete: string[] = []

    // Collect all files to delete
    if (task.converted_file_path) {
      filesToDelete.push(task.converted_file_path)
    }

    // Add segment files
    for (const segment of task.segments) {
      if (segment.file_path) {
        filesToDelete.push(segment.file_path)
      }
    }

    // Delete files with retry logic
    for (const filePath of filesToDelete) {
      if (await this.deleteFileWithRetry(filePath, options)) {
        filesDeleted++
      }
    }

    return filesDeleted
  }

  private async deleteFileWithRetry(
    filePath: string, 
    options: Required<CleanupOptions>
  ): Promise<boolean> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
      try {
        const { error } = await supabaseAdmin.storage
          .from('audio-files')
          .remove([filePath])

        if (error) {
          throw new Error(`Storage deletion failed: ${error.message}`)
        }

        logger.debug('File deleted successfully', { filePath, attempt })
        return true
      } catch (error) {
        lastError = error as Error
        logger.warn('File deletion attempt failed', lastError, { 
          filePath, 
          attempt: attempt + 1, 
          maxRetries: options.maxRetries 
        })

        if (attempt < options.maxRetries) {
          // Exponential backoff
          const delay = options.retryDelayMs * Math.pow(2, attempt)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    logger.error('File deletion failed after all retries', lastError!, { filePath })
    return false
  }

  private async markTaskCleaned(taskId: string): Promise<void> {
    try {
      // We could add a 'cleaned_at' field to the tasks table in a future migration
      // For now, we'll just log that the task was cleaned
      logger.info('Task marked as cleaned', { taskId })
    } catch (error) {
      logger.error('Failed to mark task as cleaned', error as Error, { taskId })
      // Don't throw here as this is not critical
    }
  }

  private async getTaskCount(status?: string): Promise<number> {
    try {
      let query = supabaseAdmin
        .from('tasks')
        .select('id', { count: 'exact', head: true })

      if (status) {
        query = query.eq('status', status)
      }

      const { count, error } = await query

      if (error) {
        throw new DatabaseError(`Failed to get task count: ${error.message}`)
      }

      return count || 0
    } catch (error) {
      logger.error('Failed to get task count', error as Error, { status })
      throw error
    }
  }
}

export const cleanupService = new CleanupService()