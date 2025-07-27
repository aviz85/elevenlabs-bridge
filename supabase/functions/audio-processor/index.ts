import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AudioProcessingRequest {
  taskId: string
  filePath: string
  originalFilename: string
  segmentDurationMinutes?: number
}

interface AudioSegment {
  id: string
  taskId: string
  filePath: string
  startTime: number
  endTime: number
  duration: number
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          status: 405, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const { taskId, filePath, originalFilename, segmentDurationMinutes = 15 }: AudioProcessingRequest = await req.json()

    if (!taskId || !filePath) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: taskId, filePath' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Download the file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabaseClient.storage
      .from('audio-temp')
      .download(filePath)

    if (downloadError || !fileData) {
      console.error('Error downloading file:', downloadError)
      return new Response(
        JSON.stringify({ error: 'Failed to download file from storage' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Convert file to ArrayBuffer for processing
    const audioBuffer = await fileData.arrayBuffer()
    
    // Get audio duration and validate
    const duration = await getAudioDuration(audioBuffer, originalFilename)
    
    if (duration <= 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid audio file or unable to determine duration' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Convert to MP3 if needed
    const mp3Buffer = await convertToMp3(audioBuffer, originalFilename)
    
    // Split audio into segments if duration exceeds segment limit
    const segmentDurationSeconds = segmentDurationMinutes * 60
    const segments: AudioSegment[] = []
    
    if (duration <= segmentDurationSeconds) {
      // Single segment - upload the converted MP3
      const convertedPath = `converted/${taskId}/${originalFilename.replace(/\.[^/.]+$/, '.mp3')}`
      
      const { error: uploadError } = await supabaseClient.storage
        .from('audio-temp')
        .upload(convertedPath, mp3Buffer, {
          contentType: 'audio/mpeg',
          upsert: true
        })

      if (uploadError) {
        console.error('Error uploading converted file:', uploadError)
        return new Response(
          JSON.stringify({ error: 'Failed to upload converted file' }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }

      segments.push({
        id: crypto.randomUUID(),
        taskId,
        filePath: convertedPath,
        startTime: 0,
        endTime: duration,
        duration
      })
    } else {
      // Multiple segments - split the audio
      const segmentBuffers = await splitAudio(mp3Buffer, segmentDurationSeconds)
      
      for (let i = 0; i < segmentBuffers.length; i++) {
        const startTime = i * segmentDurationSeconds
        const endTime = Math.min((i + 1) * segmentDurationSeconds, duration)
        const segmentPath = `segments/${taskId}/segment_${i + 1}.mp3`
        
        const { error: uploadError } = await supabaseClient.storage
          .from('audio-temp')
          .upload(segmentPath, segmentBuffers[i], {
            contentType: 'audio/mpeg',
            upsert: true
          })

        if (uploadError) {
          console.error(`Error uploading segment ${i + 1}:`, uploadError)
          return new Response(
            JSON.stringify({ error: `Failed to upload segment ${i + 1}` }),
            { 
              status: 500, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          )
        }

        segments.push({
          id: crypto.randomUUID(),
          taskId,
          filePath: segmentPath,
          startTime,
          endTime,
          duration: endTime - startTime
        })
      }
    }

    // Store segment information in database
    for (const segment of segments) {
      const { error: dbError } = await supabaseClient
        .from('segments')
        .insert({
          id: segment.id,
          task_id: segment.taskId,
          file_path: segment.filePath,
          start_time: segment.startTime,
          end_time: segment.endTime,
          status: 'pending'
        })

      if (dbError) {
        console.error('Error inserting segment:', dbError)
        return new Response(
          JSON.stringify({ error: 'Failed to store segment information' }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        )
      }
    }

    // Update task with total segments count
    const { error: updateError } = await supabaseClient
      .from('tasks')
      .update({ 
        total_segments: segments.length,
        converted_file_path: segments.length === 1 ? segments[0].filePath : null
      })
      .eq('id', taskId)

    if (updateError) {
      console.error('Error updating task:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update task information' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        taskId,
        totalDuration: duration,
        segmentsCreated: segments.length,
        segments: segments.map(s => ({
          id: s.id,
          filePath: s.filePath,
          startTime: s.startTime,
          endTime: s.endTime,
          duration: s.duration
        }))
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Audio processing error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error during audio processing' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

// Audio duration detection using Web Audio API concepts
async function getAudioDuration(audioBuffer: ArrayBuffer, filename: string): Promise<number> {
  try {
    // For now, we'll use FFmpeg to get duration
    // This is a simplified approach - in production you might want more robust detection
    const tempFile = await Deno.makeTempFile({ suffix: getFileExtension(filename) })
    await Deno.writeFile(tempFile, new Uint8Array(audioBuffer))
    
    const ffprobeCmd = new Deno.Command('ffprobe', {
      args: [
        '-v', 'quiet',
        '-show_entries', 'format=duration',
        '-of', 'csv=p=0',
        tempFile
      ],
      stdout: 'piped',
      stderr: 'piped'
    })
    
    const { code, stdout } = await ffprobeCmd.output()
    await Deno.remove(tempFile)
    
    if (code === 0) {
      const duration = parseFloat(new TextDecoder().decode(stdout).trim())
      return isNaN(duration) ? 0 : duration
    }
    
    return 0
  } catch (error) {
    console.error('Error getting audio duration:', error)
    return 0
  }
}

// Convert audio to MP3 format using FFmpeg
async function convertToMp3(audioBuffer: ArrayBuffer, filename: string): Promise<Uint8Array> {
  try {
    const inputFile = await Deno.makeTempFile({ suffix: getFileExtension(filename) })
    const outputFile = await Deno.makeTempFile({ suffix: '.mp3' })
    
    await Deno.writeFile(inputFile, new Uint8Array(audioBuffer))
    
    const ffmpegCmd = new Deno.Command('ffmpeg', {
      args: [
        '-i', inputFile,
        '-acodec', 'mp3',
        '-ab', '128k',
        '-ar', '44100',
        '-y', // Overwrite output file
        outputFile
      ],
      stdout: 'piped',
      stderr: 'piped'
    })
    
    const { code } = await ffmpegCmd.output()
    
    if (code === 0) {
      const mp3Data = await Deno.readFile(outputFile)
      await Deno.remove(inputFile)
      await Deno.remove(outputFile)
      return mp3Data
    } else {
      await Deno.remove(inputFile)
      await Deno.remove(outputFile)
      throw new Error('FFmpeg conversion failed')
    }
  } catch (error) {
    console.error('Error converting to MP3:', error)
    throw error
  }
}

// Split audio into segments using FFmpeg
async function splitAudio(mp3Buffer: Uint8Array, segmentDurationSeconds: number): Promise<Uint8Array[]> {
  try {
    const inputFile = await Deno.makeTempFile({ suffix: '.mp3' })
    await Deno.writeFile(inputFile, mp3Buffer)
    
    // Get total duration first
    const ffprobeCmd = new Deno.Command('ffprobe', {
      args: [
        '-v', 'quiet',
        '-show_entries', 'format=duration',
        '-of', 'csv=p=0',
        inputFile
      ],
      stdout: 'piped'
    })
    
    const { stdout } = await ffprobeCmd.output()
    const totalDuration = parseFloat(new TextDecoder().decode(stdout).trim())
    
    const segments: Uint8Array[] = []
    const numSegments = Math.ceil(totalDuration / segmentDurationSeconds)
    
    for (let i = 0; i < numSegments; i++) {
      const startTime = i * segmentDurationSeconds
      const outputFile = await Deno.makeTempFile({ suffix: '.mp3' })
      
      const ffmpegCmd = new Deno.Command('ffmpeg', {
        args: [
          '-i', inputFile,
          '-ss', startTime.toString(),
          '-t', segmentDurationSeconds.toString(),
          '-acodec', 'copy',
          '-y',
          outputFile
        ],
        stdout: 'piped',
        stderr: 'piped'
      })
      
      const { code } = await ffmpegCmd.output()
      
      if (code === 0) {
        const segmentData = await Deno.readFile(outputFile)
        segments.push(segmentData)
      }
      
      await Deno.remove(outputFile)
    }
    
    await Deno.remove(inputFile)
    return segments
  } catch (error) {
    console.error('Error splitting audio:', error)
    throw error
  }
}

// Helper function to get file extension
function getFileExtension(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  return ext ? `.${ext}` : '.mp3'
}