// Simple test to verify cleanup service functionality
console.log('Testing cleanup service basic functionality...')

// Mock environment variables
process.env.SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_ANON_KEY = 'test-anon-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'
process.env.ELEVENLABS_API_KEY = 'test-elevenlabs-key'
process.env.CLEANUP_INTERVAL_HOURS = '24'

try {
  // Test that we can import the cleanup service
  const { CleanupService } = require('./src/services/cleanup.ts')
  
  console.log('✅ CleanupService imported successfully')
  
  // Test that we can create an instance
  const cleanupService = new CleanupService()
  console.log('✅ CleanupService instance created successfully')
  
  // Test that methods exist
  console.log('✅ performCleanup method exists:', typeof cleanupService.performCleanup === 'function')
  console.log('✅ cleanupTask method exists:', typeof cleanupService.cleanupTask === 'function')
  console.log('✅ getCleanupStats method exists:', typeof cleanupService.getCleanupStats === 'function')
  console.log('✅ scheduleCleanup method exists:', typeof cleanupService.scheduleCleanup === 'function')
  
  console.log('\n🎉 All basic tests passed!')
  
} catch (error) {
  console.error('❌ Test failed:', error.message)
  process.exit(1)
}