/**
 * Setup script to verify the application is ready to run
 * Run with: npx ts-node src/scripts/setup.ts
 */

import { supabaseAdmin } from '../lib/supabase'
import { logger } from '../lib/logger'

async function setup() {
  console.log('🚀 Setting up ElevenLabs Proxy Server...\n')

  try {
    // Check environment variables
    console.log('1. Checking environment variables:')
    const requiredEnvVars = [
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY'
    ]

    for (const envVar of requiredEnvVars) {
      if (process.env[envVar]) {
        console.log(`   ✅ ${envVar}: configured`)
      } else {
        console.log(`   ❌ ${envVar}: missing`)
      }
    }

    // Check optional environment variables
    const optionalEnvVars = [
      'ELEVENLABS_API_KEY',
      'WEBHOOK_BASE_URL'
    ]

    for (const envVar of optionalEnvVars) {
      if (process.env[envVar]) {
        console.log(`   ✅ ${envVar}: configured`)
      } else {
        console.log(`   ⚠️  ${envVar}: not set (using defaults/mocks)`)
      }
    }

    // Check database connection
    console.log('\n2. Checking database connection:')
    const { data, error } = await supabaseAdmin
      .from('tasks')
      .select('count')
      .limit(1)

    if (error) {
      console.log(`   ❌ Database connection failed: ${error.message}`)
      throw error
    } else {
      console.log('   ✅ Database connection successful')
    }

    // Check tables exist
    console.log('\n3. Checking database tables:')
    const { data: tables, error: tablesError } = await supabaseAdmin
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['tasks', 'segments'])

    if (tablesError) {
      console.log(`   ❌ Could not check tables: ${tablesError.message}`)
    } else {
      const tableNames = tables?.map(t => t.table_name) || []
      
      if (tableNames.includes('tasks')) {
        console.log('   ✅ tasks table exists')
      } else {
        console.log('   ❌ tasks table missing')
      }
      
      if (tableNames.includes('segments')) {
        console.log('   ✅ segments table exists')
      } else {
        console.log('   ❌ segments table missing')
      }
    }

    console.log('\n🎉 Setup complete! You can now run:')
    console.log('   npm run dev          # Start development server')
    console.log('   npm run test:mocks   # Test mock services')
    console.log('   npm run test:webhook # Test webhook simulation')
    console.log('\nThen visit http://localhost:3000 to use the test interface')

  } catch (error) {
    console.error('\n❌ Setup failed:', error)
    console.log('\nPlease check your .env.local file and Supabase configuration')
    process.exit(1)
  }
}

// Run setup
setup()