import { useState, useRef } from 'react'
import Head from 'next/head'

interface TaskStatus {
  taskId: string
  status: string
  progress: {
    totalSegments: number
    completedSegments: number
    percentage: number
  }
  originalFilename: string
  finalTranscription?: string
  error?: string
  createdAt: string
  completedAt?: string
  segments: Array<{
    id: string
    startTime: number
    endTime: number
    status: string
    transcriptionText?: string
    error?: string
  }>
}

export default function TestReal() {
  const [webhookUrl, setWebhookUrl] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [taskId, setTaskId] = useState('')
  const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ngrokUrl, setNgrokUrl] = useState('https://your-ngrok-url.ngrok.io')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setError('')
    }
  }

  const startRealTranscription = async () => {
    if (!selectedFile) {
      setError('Please select an audio file')
      return
    }

    if (!webhookUrl) {
      setError('Please enter a webhook URL')
      return
    }

    setLoading(true)
    setError('')
    
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('webhookUrl', webhookUrl)

      const response = await fetch('/api/transcribe-real', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start transcription')
      }

      setTaskId(data.taskId)
      setError('')
      
      // Start polling for status
      pollTaskStatus(data.taskId)

    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const pollTaskStatus = async (id: string) => {
    try {
      const response = await fetch(`/api/status/${id}`)
      const data = await response.json()

      if (response.ok) {
        setTaskStatus(data)
        
        // Continue polling if still processing
        if (data.status === 'processing') {
          setTimeout(() => pollTaskStatus(id), 3000) // Poll every 3 seconds
        }
      } else {
        setError(data.error || 'Failed to get status')
      }
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const checkStatus = async () => {
    if (!taskId) return
    
    setLoading(true)
    await pollTaskStatus(taskId)
    setLoading(false)
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <>
      <Head>
        <title>ElevenLabs Proxy Server - Real API Test</title>
        <meta name="description" content="Test interface for real ElevenLabs API integration" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px', fontFamily: 'Arial, sans-serif' }}>
        <h1>🎙️ ElevenLabs Proxy Server - Real API Test</h1>
        <p>Test interface for real audio file transcription using ElevenLabs Scribe API</p>

        <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#e3f2fd', border: '1px solid #2196f3', borderRadius: '8px' }}>
          <h3>📋 Setup Instructions:</h3>
          <ol>
            <li><strong>Install ngrok:</strong> <code>npm install -g ngrok</code></li>
            <li><strong>Start your Next.js server:</strong> <code>npm run dev</code></li>
            <li><strong>In another terminal, start ngrok:</strong> <code>ngrok http 3000</code></li>
            <li><strong>Copy the HTTPS URL</strong> (e.g., https://abc123.ngrok.io) and paste it below</li>
            <li><strong>The webhook URL will be:</strong> <code>YOUR_NGROK_URL/api/webhook/elevenlabs</code></li>
          </ol>
        </div>

        <div style={{ marginBottom: '20px', padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
          <h2>🚀 Start Real Transcription</h2>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Ngrok URL:
            </label>
            <input
              type="url"
              value={ngrokUrl}
              onChange={(e) => {
                setNgrokUrl(e.target.value)
                setWebhookUrl(`${e.target.value}/api/webhook/elevenlabs`)
              }}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
              placeholder="https://abc123.ngrok.io"
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Webhook URL (auto-generated):
            </label>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
              placeholder="https://abc123.ngrok.io/api/webhook/elevenlabs"
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              Audio File:
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/*"
              onChange={handleFileSelect}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            {selectedFile && (
              <div style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>
                Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
              </div>
            )}
          </div>

          <button
            onClick={startRealTranscription}
            disabled={loading || !selectedFile || !webhookUrl}
            style={{
              padding: '12px 24px',
              backgroundColor: loading ? '#ccc' : '#4caf50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '16px',
              fontWeight: 'bold'
            }}
          >
            {loading ? '🔄 Processing...' : '🎯 Start Real Transcription'}
          </button>
        </div>

        {taskId && (
          <div style={{ marginBottom: '20px', padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
            <h2>📊 Task Status</h2>
            <p><strong>Task ID:</strong> <code>{taskId}</code></p>
            
            <button
              onClick={checkStatus}
              disabled={loading}
              style={{
                padding: '8px 16px',
                backgroundColor: '#2196f3',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                marginBottom: '15px'
              }}
            >
              🔄 Refresh Status
            </button>

            {taskStatus && (
              <div>
                <p><strong>Status:</strong> 
                  <span style={{ 
                    color: taskStatus.status === 'completed' ? 'green' : 
                           taskStatus.status === 'failed' ? 'red' : 'orange',
                    fontWeight: 'bold',
                    marginLeft: '8px'
                  }}>
                    {taskStatus.status.toUpperCase()}
                  </span>
                </p>
                
                <p><strong>Progress:</strong> {taskStatus.progress.completedSegments}/{taskStatus.progress.totalSegments} segments ({taskStatus.progress.percentage}%)</p>
                
                <div style={{ 
                  width: '100%', 
                  backgroundColor: '#f0f0f0', 
                  borderRadius: '4px',
                  marginBottom: '15px'
                }}>
                  <div style={{
                    width: `${taskStatus.progress.percentage}%`,
                    backgroundColor: '#4caf50',
                    height: '24px',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}>
                    {taskStatus.progress.percentage}%
                  </div>
                </div>

                <p><strong>Original File:</strong> {taskStatus.originalFilename}</p>
                <p><strong>Created:</strong> {new Date(taskStatus.createdAt).toLocaleString()}</p>
                {taskStatus.completedAt && (
                  <p><strong>Completed:</strong> {new Date(taskStatus.completedAt).toLocaleString()}</p>
                )}

                {taskStatus.error && (
                  <div style={{ 
                    padding: '12px', 
                    backgroundColor: '#ffebee', 
                    border: '1px solid #f44336',
                    borderRadius: '4px',
                    color: '#c62828',
                    marginBottom: '15px'
                  }}>
                    <strong>❌ Error:</strong> {taskStatus.error}
                  </div>
                )}

                {taskStatus.finalTranscription && (
                  <div style={{ 
                    padding: '15px', 
                    backgroundColor: '#e8f5e8', 
                    border: '1px solid #4caf50',
                    borderRadius: '4px',
                    marginBottom: '15px'
                  }}>
                    <h3>✅ Final Transcription:</h3>
                    <div style={{ 
                      whiteSpace: 'pre-wrap', 
                      backgroundColor: 'white',
                      padding: '10px',
                      borderRadius: '4px',
                      border: '1px solid #ddd',
                      maxHeight: '200px',
                      overflowY: 'auto'
                    }}>
                      {taskStatus.finalTranscription}
                    </div>
                  </div>
                )}

                {taskStatus.segments.length > 0 && (
                  <div>
                    <h3>📝 Segments:</h3>
                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                      {taskStatus.segments.map((segment, index) => (
                        <div key={segment.id} style={{ 
                          padding: '12px', 
                          border: '1px solid #ddd', 
                          borderRadius: '4px',
                          marginBottom: '10px',
                          backgroundColor: segment.status === 'completed' ? '#f1f8e9' : 
                                         segment.status === 'failed' ? '#ffebee' : '#fff3e0'
                        }}>
                          <p><strong>🎵 Segment {index + 1}</strong> ({formatTime(segment.startTime)} - {formatTime(segment.endTime)})</p>
                          <p><strong>Status:</strong> 
                            <span style={{ 
                              color: segment.status === 'completed' ? 'green' : 
                                     segment.status === 'failed' ? 'red' : 'orange',
                              marginLeft: '8px',
                              fontWeight: 'bold'
                            }}>
                              {segment.status.toUpperCase()}
                            </span>
                          </p>
                          {segment.transcriptionText && (
                            <div style={{ marginTop: '8px' }}>
                              <strong>📝 Transcription:</strong>
                              <div style={{ 
                                backgroundColor: 'white',
                                padding: '8px',
                                borderRadius: '4px',
                                border: '1px solid #ddd',
                                marginTop: '4px',
                                fontSize: '14px'
                              }}>
                                {segment.transcriptionText}
                              </div>
                            </div>
                          )}
                          {segment.error && (
                            <p style={{ color: 'red', marginTop: '8px' }}>
                              <strong>❌ Error:</strong> {segment.error}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {error && (
          <div style={{ 
            padding: '15px', 
            backgroundColor: '#ffebee', 
            border: '1px solid #f44336',
            borderRadius: '4px',
            color: '#c62828',
            marginBottom: '20px'
          }}>
            <strong>❌ Error:</strong> {error}
          </div>
        )}

        <div style={{ marginTop: '40px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
          <h2>🔧 API Endpoints</h2>
          <ul>
            <li><strong>POST /api/transcribe-real</strong> - Real file upload and transcription</li>
            <li><strong>GET /api/status/[taskId]</strong> - Get task status</li>
            <li><strong>POST /api/webhook/elevenlabs</strong> - ElevenLabs webhook (for ngrok)</li>
            <li><strong>GET /api/health</strong> - Health check</li>
          </ul>
          
          <h3>🧪 Test with Sample Audio</h3>
          <p>You can test with any audio file (MP3, WAV, M4A, etc.) up to 100MB. The system will:</p>
          <ul>
            <li>✅ Upload your file to Supabase Storage</li>
            <li>🔄 Convert to MP3 and split into 15-minute segments if needed</li>
            <li>🎯 Send each segment to real ElevenLabs Scribe API</li>
            <li>📞 Receive webhook notifications via ngrok</li>
            <li>📝 Combine results into final transcription</li>
            <li>🧹 Clean up temporary files</li>
          </ul>
        </div>
      </div>
    </>
  )
}