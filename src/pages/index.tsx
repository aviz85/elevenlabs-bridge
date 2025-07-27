import { useState } from 'react'
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

export default function Home() {
  const [webhookUrl, setWebhookUrl] = useState('https://webhook.site/your-unique-url')
  const [filename, setFilename] = useState('sample-audio.mp3')
  const [fileSize, setFileSize] = useState(5 * 1024 * 1024) // 5MB
  const [taskId, setTaskId] = useState('')
  const [taskStatus, setTaskStatus] = useState<TaskStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const startTranscription = async () => {
    setLoading(true)
    setError('')
    
    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          webhookUrl,
          filename,
          fileSize
        })
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
          setTimeout(() => pollTaskStatus(id), 2000)
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

  return (
    <>
      <Head>
        <title>ElevenLabs Proxy Server - Test Interface</title>
        <meta name="description" content="Test interface for ElevenLabs proxy server" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', fontFamily: 'Arial, sans-serif' }}>
        <h1>ElevenLabs Proxy Server</h1>
        <p>Test interface for the speech-to-text transcription service</p>

        <div style={{ marginBottom: '20px', padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
          <h2>Start Transcription</h2>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Webhook URL:</label>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
              placeholder="https://webhook.site/your-unique-url"
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>Filename:</label>
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
              placeholder="sample-audio.mp3"
            />
          </div>

          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px' }}>File Size (bytes):</label>
            <input
              type="number"
              value={fileSize}
              onChange={(e) => setFileSize(parseInt(e.target.value))}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
          </div>

          <button
            onClick={startTranscription}
            disabled={loading || !webhookUrl || !filename}
            style={{
              padding: '10px 20px',
              backgroundColor: loading ? '#ccc' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? 'Starting...' : 'Start Transcription'}
          </button>
        </div>

        {taskId && (
          <div style={{ marginBottom: '20px', padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
            <h2>Task Status</h2>
            <p><strong>Task ID:</strong> {taskId}</p>
            
            <button
              onClick={checkStatus}
              disabled={loading}
              style={{
                padding: '8px 16px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                marginBottom: '15px'
              }}
            >
              Refresh Status
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
                    backgroundColor: '#007bff',
                    height: '20px',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease'
                  }} />
                </div>

                <p><strong>Original Filename:</strong> {taskStatus.originalFilename}</p>
                <p><strong>Created:</strong> {new Date(taskStatus.createdAt).toLocaleString()}</p>
                {taskStatus.completedAt && (
                  <p><strong>Completed:</strong> {new Date(taskStatus.completedAt).toLocaleString()}</p>
                )}

                {taskStatus.error && (
                  <div style={{ 
                    padding: '10px', 
                    backgroundColor: '#f8d7da', 
                    border: '1px solid #f5c6cb',
                    borderRadius: '4px',
                    color: '#721c24',
                    marginBottom: '15px'
                  }}>
                    <strong>Error:</strong> {taskStatus.error}
                  </div>
                )}

                {taskStatus.finalTranscription && (
                  <div style={{ 
                    padding: '15px', 
                    backgroundColor: '#d4edda', 
                    border: '1px solid #c3e6cb',
                    borderRadius: '4px',
                    marginBottom: '15px'
                  }}>
                    <h3>Final Transcription:</h3>
                    <p style={{ whiteSpace: 'pre-wrap' }}>{taskStatus.finalTranscription}</p>
                  </div>
                )}

                {taskStatus.segments.length > 0 && (
                  <div>
                    <h3>Segments:</h3>
                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                      {taskStatus.segments.map((segment, index) => (
                        <div key={segment.id} style={{ 
                          padding: '10px', 
                          border: '1px solid #ddd', 
                          borderRadius: '4px',
                          marginBottom: '10px'
                        }}>
                          <p><strong>Segment {index + 1}</strong> ({formatTime(segment.startTime)} - {formatTime(segment.endTime)})</p>
                          <p><strong>Status:</strong> 
                            <span style={{ 
                              color: segment.status === 'completed' ? 'green' : 
                                     segment.status === 'failed' ? 'red' : 'orange',
                              marginLeft: '8px'
                            }}>
                              {segment.status}
                            </span>
                          </p>
                          {segment.transcriptionText && (
                            <p><strong>Text:</strong> {segment.transcriptionText}</p>
                          )}
                          {segment.error && (
                            <p style={{ color: 'red' }}><strong>Error:</strong> {segment.error}</p>
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
            backgroundColor: '#f8d7da', 
            border: '1px solid #f5c6cb',
            borderRadius: '4px',
            color: '#721c24',
            marginBottom: '20px'
          }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        <div style={{ marginTop: '40px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
          <h2>API Endpoints</h2>
          <ul>
            <li><strong>POST /api/transcribe</strong> - Start transcription</li>
            <li><strong>GET /api/status/[taskId]</strong> - Get task status</li>
            <li><strong>POST /api/webhook/elevenlabs</strong> - ElevenLabs webhook</li>
            <li><strong>GET /api/health</strong> - Health check</li>
          </ul>
        </div>
      </div>
    </>
  )
}