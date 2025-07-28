#!/usr/bin/env tsx

/**
 * Initialization script for the cleanup service
 * This script can be used to start the automatic cleanup scheduler
 * or perform an initial cleanup run
 */

import { cleanupService } from '@/services/cleanup'
import { logger } from '@/lib/logger'
import { config } from '@/lib/config'

interface CleanupOptions {
  schedule?: boolean
  immediate?: boolean
  force?: boolean
  taskId?: string
  stats?: boolean
}

async function main() {
  const args = process.argv.slice(2)
  const options: CleanupOptions = {}

  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--schedule':
        options.schedule = true
        break
      case '--immediate':
        options.immediate = true
        break
      case '--force':
        options.force = true
        break
      case '--task':
        options.taskId = args[++i]
        break
      case '--stats':
        options.stats = true
        break
      case '--help':
        printHelp()
        process.exit(0)
      default:
        console.error(`Unknown option: ${args[i]}`)
        printHelp()
        process.exit(1)
    }
  }

  try {
    if (options.stats) {
      await showStats()
    } else if (options.taskId) {
      await cleanupSpecificTask(options.taskId, options.force)
    } else if (options.immediate) {
      await performImmediateCleanup(options.force)
    } else if (options.schedule) {
      await startScheduledCleanup()
    } else {
      console.log('No action specified. Use --help for usage information.')
      printHelp()
    }
  } catch (error) {
    logger.error('Cleanup script failed', error as Error)
    console.error('Error:', (error as Error).message)
    process.exit(1)
  }
}

async function showStats() {
  console.log('📊 Fetching cleanup statistics...\n')
  
  const stats = await cleanupService.getCleanupStats()
  
  console.log('Cleanup Statistics:')
  console.log('==================')
  console.log(`Total Tasks: ${stats.totalTasks}`)
  console.log(`Completed Tasks: ${stats.completedTasks}`)
  console.log(`Failed Tasks: ${stats.failedTasks}`)
  console.log(`Files Deleted: ${stats.filesDeleted}`)
  console.log(`Errors: ${stats.errors}`)
  console.log(`Last Cleanup: ${stats.lastCleanup.toISOString()}`)
  console.log(`Cleanup Interval: ${config.app.cleanupIntervalHours} hours`)
}

async function cleanupSpecificTask(taskId: string, force = false) {
  console.log(`🧹 Cleaning up task: ${taskId}${force ? ' (forced)' : ''}...\n`)
  
  const success = await cleanupService.cleanupTask(taskId, {
    maxRetries: force ? 5 : 3
  })
  
  if (success) {
    console.log(`✅ Task ${taskId} cleaned up successfully`)
  } else {
    console.log(`❌ Failed to clean up task ${taskId}`)
    process.exit(1)
  }
}

async function performImmediateCleanup(force = false) {
  console.log(`🧹 Starting immediate cleanup${force ? ' (forced)' : ''}...\n`)
  
  const result = await cleanupService.performCleanup({
    maxRetries: force ? 5 : 3,
    batchSize: 50
  })
  
  console.log('Cleanup Results:')
  console.log('================')
  console.log(`Tasks Processed: ${result.tasksProcessed}`)
  console.log(`Files Deleted: ${result.filesDeleted}`)
  console.log(`Errors: ${result.errors.length}`)
  
  if (result.errors.length > 0) {
    console.log('\nErrors encountered:')
    result.errors.forEach((error, index) => {
      console.log(`${index + 1}. Task ${error.taskId}: ${error.error}`)
    })
  }
  
  console.log('\n✅ Cleanup completed')
}

async function startScheduledCleanup() {
  console.log(`⏰ Starting scheduled cleanup service...`)
  console.log(`Cleanup interval: ${config.app.cleanupIntervalHours} hours`)
  console.log('Press Ctrl+C to stop\n')
  
  const intervalId = cleanupService.scheduleCleanup()
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Stopping scheduled cleanup...')
    clearInterval(intervalId)
    process.exit(0)
  })
  
  process.on('SIGTERM', () => {
    console.log('\n🛑 Stopping scheduled cleanup...')
    clearInterval(intervalId)
    process.exit(0)
  })
  
  // Keep the process alive
  process.stdin.resume()
}

function printHelp() {
  console.log(`
Cleanup Service Initialization Script
=====================================

Usage: tsx src/scripts/init-cleanup.ts [options]

Options:
  --schedule     Start the scheduled cleanup service
  --immediate    Perform an immediate cleanup run
  --force        Use increased retry attempts for cleanup operations
  --task <id>    Clean up a specific task by ID
  --stats        Show cleanup statistics
  --help         Show this help message

Examples:
  tsx src/scripts/init-cleanup.ts --schedule
  tsx src/scripts/init-cleanup.ts --immediate --force
  tsx src/scripts/init-cleanup.ts --task abc123-def456-ghi789
  tsx src/scripts/init-cleanup.ts --stats

Environment Variables:
  CLEANUP_INTERVAL_HOURS    Cleanup interval in hours (default: 24)
  SUPABASE_URL             Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY Supabase service role key

Current Configuration:
  Cleanup Interval: ${config.app.cleanupIntervalHours} hours
`)
}

// Run the script if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Script failed:', error)
    process.exit(1)
  })
}

export { main as initCleanup }