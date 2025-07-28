import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface QueueJob {
  id: string
  segmentId: string
  taskId: string
  audioUrl: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  retryCount: number
  createdAt: string
  updatedAt: string
}

class SupabaseQueueProcessor {
  private supabase: any
  private elevenLabsApiKey: string
  private webhookBaseUrl: string

  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )
    this.elevenLabsApiKey = Deno.env.get('ELEVENLABS_API_KEY') ?? ''
    this.webhookBaseUrl = Deno.env.get('WEBHOOK_BASE_URL') ?? 'https://elevenlabs-bridge-henna.vercel.app'
  }

  async processQueue(): Promise<{ processedJobs: number; remainingJobs: number }> {
    console.log('🚀 Starting Supabase queue processing...')
    
    try {
      // 1️⃣ Load pending segments from database
      const pendingSegments = await this.loadPendingSegments()
      
      if (pendingSegments.length === 0) {
        console.log('✅ No pending segments found')
        return { processedJobs: 0, remainingJobs: 0 }
      }

      console.log(`📋 Found ${pendingSegments.length} pending segments`)

      // 2️⃣ Process segments (up to 8 concurrent)
      const maxConcurrent = 8
      let processedJobs = 0
      
      for (let i = 0; i < pendingSegments.length; i += maxConcurrent) {
        const batch = pendingSegments.slice(i, i + maxConcurrent)
        console.log(`🔄 Processing batch ${Math.floor(i / maxConcurrent) + 1}: ${batch.length} segments`)
        
        const promises = batch.map(segment => this.processSegment(segment))
        const results = await Promise.allSettled(promises)
        
        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            processedJobs++
            console.log(`✅ Segment ${batch[index].id} processed successfully`)
          } else {
            console.error(`❌ Segment ${batch[index].id} failed:`, result.reason)
          }
        })
      }

      // 3️⃣ Check remaining jobs
      const remainingSegments = await this.loadPendingSegments()
      
      console.log(`🎯 Queue processing completed: ${processedJobs} processed, ${remainingSegments.length} remaining`)
      
      return {
        processedJobs,
        remainingJobs: remainingSegments.length
      }
      
    } catch (error) {
      console.error('💥 Queue processing failed:', error)
      throw error
    }
  }

  private async loadPendingSegments(): Promise<any[]> {
    // Load pending segments AND stuck processing segments (>1 minute old)
    const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000).toISOString()
    
    // Get pending segments
    const { data: pendingSegments, error: pendingError } = await this.supabase
      .from('segments')
      .select('*')
      .eq('status', 'pending')
      .order('start_time', { ascending: true })
    
    // Get stuck processing segments
    const { data: stuckSegments, error: stuckError } = await this.supabase
      .from('segments')
      .select('*')
      .eq('status', 'processing')
      .lt('updated_at', oneMinuteAgo)
      .order('start_time', { ascending: true })
    
    if (pendingError || stuckError) {
      throw new Error(`Database error: ${pendingError?.message || stuckError?.message}`)
    }
    
    const allSegments = [...(pendingSegments || []), ...(stuckSegments || [])]
    
    console.log(`📊 Loaded segments: ${pendingSegments?.length || 0} pending + ${stuckSegments?.length || 0} stuck = ${allSegments.length} total`)
    
    return allSegments
  }

  private async processSegment(segment: any): Promise<void> {
    console.log(`🔄 Processing segment ${segment.id}...`)
    
    try {
      // 1️⃣ Update status to processing
      await this.supabase
        .from('segments')
        .update({ 
          status: 'processing',
          updated_at: new Date().toISOString()
        })
        .eq('id', segment.id)

      // 2️⃣ Send to ElevenLabs
      const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'xi-api-key': this.elevenLabsApiKey,
        },
        body: JSON.stringify({
          audio_url: segment.audio_url,
          model_id: 'eleven_multilingual_v2',
          language_code: segment.language || 'auto'
        })
      })

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status}`)
      }

      const result = await response.json()
      const requestId = result.task_id || result.request_id
      
      if (!requestId) {
        throw new Error('No request_id received from ElevenLabs')
      }

      console.log(`✅ Segment ${segment.id} sent to ElevenLabs: ${requestId}`)
      
      // 3️⃣ Update with ElevenLabs request ID
      await this.supabase
        .from('segments')
        .update({ 
          elevenlabs_task_id: requestId,
          updated_at: new Date().toISOString()
        })
        .eq('id', segment.id)

    } catch (error) {
      console.error(`❌ Failed to process segment ${segment.id}:`, error)
      
      // Mark as failed
      await this.supabase
        .from('segments')
        .update({ 
          status: 'failed',
          error: (error as Error).message,
          updated_at: new Date().toISOString()
        })
        .eq('id', segment.id)
        
      throw error
    }
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log(`📡 Queue processor invoked: ${req.method} ${req.url}`)
    
    const processor = new SupabaseQueueProcessor()
    const result = await processor.processQueue()
    
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Queue processing completed',
        ...result,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
    
  } catch (error) {
    console.error('💥 Queue processor error:', error)
    
    return new Response(
      JSON.stringify({
        success: false,
        error: (error as Error).message,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
}) 