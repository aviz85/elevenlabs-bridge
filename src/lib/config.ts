export const config = {
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY!,
    model: 'scribe_v1' as const,
    baseUrl: 'https://api.elevenlabs.io/v1'
  },
  
  supabase: {
    url: process.env.SUPABASE_URL!,
    anonKey: process.env.SUPABASE_ANON_KEY!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!
  },
  
  google: {
    functionUrl: process.env.GOOGLE_CLOUD_FUNCTION_URL || 
      'https://us-central1-dreemz-whatsapp-mentor.cloudfunctions.net/splitAudio',
    useGoogleFunctions: process.env.USE_GOOGLE_CLOUD_FUNCTIONS === 'true'
  },
  
  app: {
    webhookBaseUrl: process.env.WEBHOOK_BASE_URL || 'http://localhost:3000',
    maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS || '4'),
    segmentDurationMinutes: parseInt(process.env.SEGMENT_DURATION_MINUTES || '15'),
    cleanupIntervalHours: parseInt(process.env.CLEANUP_INTERVAL_HOURS || '24')
  }
}

// Validate required environment variables
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ELEVENLABS_API_KEY'
]

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`)
  }
}