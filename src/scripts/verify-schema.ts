/**
 * Schema verification script to validate database migration files
 * Run with: npx tsx src/scripts/verify-schema.ts
 */

import { readFileSync } from 'fs'
import { join } from 'path'

function verifySchema() {
  console.log('🔍 Verifying database schema files...\n')

  try {
    // Check migration files exist
    const migration1Path = join(process.cwd(), 'supabase/migrations/001_initial_schema.sql')
    const migration2Path = join(process.cwd(), 'supabase/migrations/002_rls_and_storage.sql')

    console.log('1. Checking migration files:')
    
    try {
      const migration1 = readFileSync(migration1Path, 'utf8')
      console.log('   ✅ 001_initial_schema.sql exists')
      
      // Verify key components in migration 1
      const requiredComponents1 = [
        'CREATE TABLE tasks',
        'CREATE TABLE segments',
        'CREATE INDEX idx_tasks_status',
        'CREATE INDEX idx_segments_task_id',
        'REFERENCES tasks(id) ON DELETE CASCADE'
      ]
      
      for (const component of requiredComponents1) {
        if (migration1.includes(component)) {
          console.log(`   ✅ Contains: ${component}`)
        } else {
          console.log(`   ❌ Missing: ${component}`)
        }
      }
    } catch (error) {
      console.log('   ❌ 001_initial_schema.sql not found')
    }

    try {
      const migration2 = readFileSync(migration2Path, 'utf8')
      console.log('   ✅ 002_rls_and_storage.sql exists')
      
      // Verify key components in migration 2
      const requiredComponents2 = [
        'ALTER TABLE tasks ENABLE ROW LEVEL SECURITY',
        'ALTER TABLE segments ENABLE ROW LEVEL SECURITY',
        'CREATE POLICY',
        'INSERT INTO storage.buckets',
        'audio-temp'
      ]
      
      for (const component of requiredComponents2) {
        if (migration2.includes(component)) {
          console.log(`   ✅ Contains: ${component}`)
        } else {
          console.log(`   ❌ Missing: ${component}`)
        }
      }
    } catch (error) {
      console.log('   ❌ 002_rls_and_storage.sql not found')
    }

    // Check TypeScript types
    console.log('\n2. Checking TypeScript types:')
    const typesPath = join(process.cwd(), 'src/types/index.ts')
    
    try {
      const types = readFileSync(typesPath, 'utf8')
      console.log('   ✅ src/types/index.ts exists')
      
      const requiredTypes = [
        'interface Task',
        'interface Segment',
        'status: \'processing\' | \'completed\' | \'failed\'',
        'task_id: string',
        'elevenlabs_task_id'
      ]
      
      for (const type of requiredTypes) {
        if (types.includes(type)) {
          console.log(`   ✅ Contains: ${type}`)
        } else {
          console.log(`   ❌ Missing: ${type}`)
        }
      }
    } catch (error) {
      console.log('   ❌ src/types/index.ts not found')
    }

    // Check database service
    console.log('\n3. Checking database service:')
    const dbServicePath = join(process.cwd(), 'src/services/database.ts')
    
    try {
      const dbService = readFileSync(dbServicePath, 'utf8')
      console.log('   ✅ src/services/database.ts exists')
      
      const requiredMethods = [
        'createTask',
        'getTask',
        'updateTask',
        'createSegment',
        'getSegmentsByTaskId',
        'updateSegment',
        'getSegmentByElevenLabsTaskId',
        'incrementCompletedSegments'
      ]
      
      for (const method of requiredMethods) {
        if (dbService.includes(`async ${method}`)) {
          console.log(`   ✅ Contains method: ${method}`)
        } else {
          console.log(`   ❌ Missing method: ${method}`)
        }
      }
    } catch (error) {
      console.log('   ❌ src/services/database.ts not found')
    }

    // Check tests
    console.log('\n4. Checking database tests:')
    const testPath = join(process.cwd(), 'src/services/__tests__/database.test.ts')
    
    try {
      const tests = readFileSync(testPath, 'utf8')
      console.log('   ✅ src/services/__tests__/database.test.ts exists')
      
      const testSuites = [
        'describe(\'createTask\'',
        'describe(\'getTask\'',
        'describe(\'updateTask\'',
        'describe(\'createSegment\'',
        'describe(\'getSegmentsByTaskId\'',
        'describe(\'updateSegment\'',
        'describe(\'getSegmentByElevenLabsTaskId\'',
        'describe(\'incrementCompletedSegments\''
      ]
      
      for (const testSuite of testSuites) {
        if (tests.includes(testSuite)) {
          console.log(`   ✅ Contains test suite: ${testSuite}`)
        } else {
          console.log(`   ❌ Missing test suite: ${testSuite}`)
        }
      }
    } catch (error) {
      console.log('   ❌ src/services/__tests__/database.test.ts not found')
    }

    console.log('\n🎉 Schema verification complete!')
    console.log('\nNext steps:')
    console.log('1. Set up your Supabase project with the correct environment variables')
    console.log('2. Run the migrations in your Supabase dashboard or CLI')
    console.log('3. Test the setup with: npm run setup')

  } catch (error) {
    console.error('\n❌ Schema verification failed:', error)
    process.exit(1)
  }
}

// Run verification
verifySchema()