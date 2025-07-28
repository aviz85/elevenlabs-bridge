# Cleanup Service Usage Guide

The cleanup service provides comprehensive automatic cleanup functionality for the ElevenLabs proxy server, handling temporary file management, scheduled cleanup, and error recovery.

## Features

- **Automatic Cleanup**: Scheduled cleanup of completed and failed tasks
- **Manual Cleanup**: API endpoints for triggering cleanup on-demand
- **Retry Logic**: Exponential backoff for failed file deletions
- **Batch Processing**: Efficient processing of large numbers of tasks
- **Comprehensive Logging**: Detailed logging and monitoring
- **Statistics**: Cleanup statistics and monitoring

## API Endpoints

### POST /api/cleanup

Trigger manual cleanup operations.

**Request Body:**
```json
{
  "taskId": "optional-task-id",  // Clean specific task
  "force": false                 // Use increased retry attempts
}
```

**Response:**
```json
{
  "success": true,
  "message": "Cleanup completed successfully",
  "result": {
    "tasksProcessed": 5,
    "filesDeleted": 15,
    "errors": []
  }
}
```

### GET /api/cleanup

Get cleanup statistics.

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalTasks": 100,
    "completedTasks": 85,
    "failedTasks": 5,
    "filesDeleted": 250,
    "errors": 2,
    "lastCleanup": "2024-01-15T10:00:00Z"
  }
}
```

## Programmatic Usage

### Basic Cleanup

```typescript
import { cleanupService } from '@/services/cleanup'

// Perform general cleanup
const result = await cleanupService.performCleanup()
console.log(`Processed ${result.tasksProcessed} tasks, deleted ${result.filesDeleted} files`)

// Clean specific task
const success = await cleanupService.cleanupTask('task-id')
if (success) {
  console.log('Task cleaned successfully')
}
```

### Scheduled Cleanup

```typescript
import { cleanupService } from '@/services/cleanup'

// Start automatic cleanup scheduler
const intervalId = cleanupService.scheduleCleanup()

// Stop scheduled cleanup
clearInterval(intervalId)
```

### Get Statistics

```typescript
import { cleanupService } from '@/services/cleanup'

const stats = await cleanupService.getCleanupStats()
console.log(`Total tasks: ${stats.totalTasks}`)
console.log(`Completed: ${stats.completedTasks}`)
console.log(`Failed: ${stats.failedTasks}`)
```

## Configuration

The cleanup service uses the following environment variables:

- `CLEANUP_INTERVAL_HOURS`: Cleanup interval in hours (default: 24)
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key

## Initialization Script

Use the initialization script to manage cleanup operations:

```bash
# Show help
npx tsx src/scripts/init-cleanup.ts --help

# Start scheduled cleanup service
npx tsx src/scripts/init-cleanup.ts --schedule

# Perform immediate cleanup
npx tsx src/scripts/init-cleanup.ts --immediate

# Force cleanup with increased retries
npx tsx src/scripts/init-cleanup.ts --immediate --force

# Clean specific task
npx tsx src/scripts/init-cleanup.ts --task abc123-def456-ghi789

# Show cleanup statistics
npx tsx src/scripts/init-cleanup.ts --stats
```

## Cleanup Process

The cleanup service follows this process:

1. **Task Selection**: Identifies completed or failed tasks older than the cleanup interval
2. **File Collection**: Gathers all temporary files associated with each task:
   - Original uploaded files
   - Converted MP3 files
   - Audio segment files
3. **File Deletion**: Removes files from Supabase Storage with retry logic
4. **Database Updates**: Updates task metadata to reflect cleanup status
5. **Error Handling**: Logs errors and implements retry mechanisms

## Error Handling

The cleanup service implements comprehensive error handling:

- **Retry Logic**: Exponential backoff for failed file deletions
- **Batch Processing**: Continues processing other tasks if individual tasks fail
- **Error Logging**: Detailed error information with context
- **Graceful Degradation**: Service continues operating even with partial failures

## Monitoring

Monitor cleanup operations through:

- **API Statistics**: GET /api/cleanup endpoint
- **Application Logs**: Structured logging with cleanup context
- **Database Queries**: Direct queries on tasks and segments tables

## Integration with Other Services

The cleanup service integrates with:

- **Audio Processing Service**: Deprecated `cleanupTaskFiles()` method now uses cleanup service
- **Database Service**: Uses database service for task and segment queries
- **Queue Manager**: Coordinates with queue cleanup operations
- **Webhook System**: Triggers cleanup after successful webhook delivery

## Testing

The cleanup service includes comprehensive tests:

```bash
# Run cleanup service tests
npx jest --testPathPattern="cleanup"

# Run specific test files
npx jest src/services/__tests__/cleanup-simple.test.ts
npx jest src/__tests__/cleanup-integration.test.ts
```

## Production Deployment

For production deployment:

1. **Environment Variables**: Ensure all required environment variables are set
2. **Scheduled Cleanup**: Start the cleanup scheduler in your deployment
3. **Monitoring**: Set up monitoring for cleanup operations
4. **Error Alerting**: Configure alerts for cleanup failures

Example production startup:

```bash
# Start the application with cleanup scheduler
npm start &

# Start cleanup scheduler in background
npx tsx src/scripts/init-cleanup.ts --schedule &
```

## Troubleshooting

Common issues and solutions:

### Cleanup Not Running
- Check environment variables are set correctly
- Verify Supabase connection and permissions
- Check application logs for error messages

### Files Not Being Deleted
- Verify Supabase Storage permissions
- Check file paths in database match actual storage paths
- Review retry logic and error logs

### High Memory Usage
- Adjust batch size in cleanup options
- Monitor concurrent cleanup operations
- Check for memory leaks in file processing

### Database Errors
- Verify database connection and permissions
- Check for database locks or constraints
- Review transaction handling in cleanup operations