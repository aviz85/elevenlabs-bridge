import { useState, useRef } from 'react'
import Head from 'next/head'

export default function DemoSimple() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [taskId, setTaskId] = useState('')
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'completed' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [transcription, setTranscription] = useState('')
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setError('')
      setTranscription('')
      setProgress(0)
      setStatus('idle')
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const files = e.dataTransfer.files
    if (files.length > 0) {
      setSelectedFile(files[0])
      setError('')
      setTranscription('')
      setProgress(0)
      setStatus('idle')
    }
  }

  const startTranscription = async () => {
    if (!selectedFile) return

    setStatus('uploading')
    setError('')
    
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('webhookUrl', `${window.location.origin}/api/webhook/elevenlabs`)

      const response = await fetch('/api/transcribe-simple', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'העלאה נכשלה')
      }

      if (data.transcription) {
        // תמלול סינכרוני - הושלם מיד
        setTranscription(data.transcription)
        setStatus('completed')
        setProgress(100)
      } else if (data.taskId) {
        // תמלול אסינכרוני - מתחיל מעקב
        setTaskId(data.taskId)
        setStatus('processing')
        startPolling(data.taskId)
      }

    } catch (err) {
      setError((err as Error).message)
      setStatus('error')
    }
  }

  const startPolling = async (id: string) => {
    const poll = async () => {
      try {
        const response = await fetch(`/api/status/${id}`)
        const data = await response.json()

        if (response.ok) {
          setProgress(data.progress?.percentage || 0)
          
          if (data.status === 'completed') {
            setTranscription(data.finalTranscription || 'תמלול הושלם ללא טקסט')
            setStatus('completed')
          } else if (data.status === 'failed') {
            setError(data.error || 'התמלול נכשל')
            setStatus('error')
          } else {
            // המשך polling
            setTimeout(poll, 3000)
          }
        } else {
          setError(data.error || 'שגיאה בקבלת סטטוס')
          setStatus('error')
        }
      } catch (err) {
        setError('שגיאה בחיבור לשרת')
        setStatus('error')
      }
    }

    poll()
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getStatusText = () => {
    switch (status) {
      case 'uploading': return 'מעלה קובץ...'
      case 'processing': return `מעבד... (${progress}%)`
      case 'completed': return 'הושלם!'
      case 'error': return 'שגיאה'
      default: return 'מוכן להתחלה'
    }
  }

  const getStatusColor = () => {
    switch (status) {
      case 'uploading': return '#ff9800'
      case 'processing': return '#2196f3'
      case 'completed': return '#4caf50'
      case 'error': return '#f44336'
      default: return '#666'
    }
  }

  return (
    <>
      <Head>
        <title>תמלול אודיו - דמו פשוט</title>
        <meta name="description" content="ממשק פשוט לתמלול קבצי אודיו" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div style={{ 
        maxWidth: '800px', 
        margin: '0 auto', 
        padding: '20px', 
        fontFamily: 'system-ui, -apple-system, sans-serif',
        direction: 'rtl'
      }}>
        <h1 style={{ textAlign: 'center', color: '#333', marginBottom: '30px' }}>
          🎙️ תמלול אודיו
        </h1>
        
        <p style={{ textAlign: 'center', color: '#666', marginBottom: '40px' }}>
          העלה קובץ אודיו וקבל תמלול מדויק בעברית ובשפות נוספות
        </p>

        {/* אזור העלאה */}
        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          style={{
            border: '2px dashed #ddd',
            borderRadius: '12px',
            padding: '40px',
            textAlign: 'center',
            backgroundColor: selectedFile ? '#f8f9fa' : '#fafafa',
            marginBottom: '20px',
            cursor: 'pointer',
            transition: 'all 0.3s ease'
          }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          
          {selectedFile ? (
            <div>
              <div style={{ fontSize: '48px', marginBottom: '10px' }}>🎵</div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '5px' }}>
                {selectedFile.name}
              </div>
              <div style={{ color: '#666', fontSize: '14px' }}>
                {formatFileSize(selectedFile.size)}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '48px', marginBottom: '10px' }}>📁</div>
              <div style={{ fontSize: '18px', marginBottom: '10px' }}>
                גרור קובץ אודיו לכאן או לחץ לבחירה
              </div>
              <div style={{ color: '#666', fontSize: '14px' }}>
                נתמך: MP3, WAV, M4A, AAC, OGG, FLAC
              </div>
            </div>
          )}
        </div>

        {/* כפתור התחלה */}
        {selectedFile && (
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <button
              onClick={startTranscription}
              disabled={status === 'uploading' || status === 'processing'}
              style={{
                padding: '15px 30px',
                fontSize: '18px',
                fontWeight: 'bold',
                backgroundColor: status === 'uploading' || status === 'processing' ? '#ccc' : '#4caf50',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: status === 'uploading' || status === 'processing' ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.3s ease'
              }}
            >
              {status === 'idle' ? '🚀 התחל תמלול' : getStatusText()}
            </button>
          </div>
        )}

        {/* סרגל התקדמות */}
        {(status === 'processing' || status === 'uploading') && (
          <div style={{ marginBottom: '30px' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '8px'
            }}>
              <span style={{ color: getStatusColor(), fontWeight: 'bold' }}>
                {getStatusText()}
              </span>
              <span style={{ color: '#666' }}>
                {progress}%
              </span>
            </div>
            <div style={{
              width: '100%',
              height: '8px',
              backgroundColor: '#f0f0f0',
              borderRadius: '4px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${progress}%`,
                height: '100%',
                backgroundColor: getStatusColor(),
                transition: 'width 0.3s ease'
              }} />
            </div>
          </div>
        )}

        {/* שגיאה */}
        {error && (
          <div style={{
            padding: '15px',
            backgroundColor: '#ffebee',
            border: '1px solid #f44336',
            borderRadius: '8px',
            color: '#c62828',
            marginBottom: '20px'
          }}>
            <strong>❌ שגיאה:</strong> {error}
          </div>
        )}

        {/* תוצאות */}
        {transcription && (
          <div style={{
            padding: '20px',
            backgroundColor: '#e8f5e8',
            border: '1px solid #4caf50',
            borderRadius: '8px',
            marginBottom: '20px'
          }}>
            <h3 style={{ color: '#2e7d32', marginBottom: '15px' }}>
              ✅ תמלול הושלם בהצלחה
            </h3>
            <div style={{
              backgroundColor: 'white',
              padding: '15px',
              borderRadius: '6px',
              border: '1px solid #ddd',
              maxHeight: '400px',
              overflowY: 'auto',
              lineHeight: '1.6',
              fontSize: '16px',
              whiteSpace: 'pre-wrap'
            }}>
              {transcription}
            </div>
          </div>
        )}

        {/* מידע טכני */}
        <div style={{
          marginTop: '40px',
          padding: '20px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          fontSize: '14px',
          color: '#666'
        }}>
          <h3 style={{ color: '#333', marginBottom: '10px' }}>💡 איך זה עובד?</h3>
          <ul style={{ margin: 0, paddingRight: '20px' }}>
            <li>העלאה מאובטחת לשרת</li>
            <li>עיבוד אוטומטי בענן</li>
            <li>פיצול לקטעים (אם נדרש)</li>
            <li>תמלול עם ElevenLabs Scribe</li>
            <li>הרכבת תוצאה סופית</li>
          </ul>
        </div>
      </div>
    </>
  )
}