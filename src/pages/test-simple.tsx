import { useState, useRef } from 'react'
import Head from 'next/head'

export default function TestSimple() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [transcription, setTranscription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [language, setLanguage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setError('')
      setTranscription('')
    }
  }

  const startTranscription = async () => {
    if (!selectedFile) {
      setError('אנא בחר קובץ שמע')
      return
    }

    // Check file size (limit to 25MB for sync processing)
    if (selectedFile.size > 25 * 1024 * 1024) {
      setError('קובץ גדול מדי. מקסימום 25MB למצב סינכרוני')
      return
    }

    setLoading(true)
    setError('')
    setTranscription('')
    
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const response = await fetch('/api/transcribe-simple', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'התמלול נכשל')
      }

      setTranscription(data.transcription || 'אין תוצאת תמלול')
      setLanguage(data.language || '')
      setError('')

    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
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
        <title>תמלול פשוט - ElevenLabs</title>
        <meta name="description" content="ממשק פשוט לתמלול קבצי שמע" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', fontFamily: 'Arial, sans-serif' }}>
        <h1>🎙️ תמלול פשוט - ElevenLabs</h1>
        <p>ממשק פשוט לתמלול קבצי שמע באמצעות ElevenLabs Scribe API</p>

        <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#e3f2fd', border: '1px solid #2196f3', borderRadius: '8px' }}>
          <h3>📋 הוראות:</h3>
          <ul>
            <li><strong>גודל מקסימלי:</strong> 25MB (למצב סינכרוני)</li>
            <li><strong>פורמטים נתמכים:</strong> MP3, WAV, M4A, AAC, OGG, FLAC</li>
            <li><strong>שפות:</strong> עברית, אנגלית ועוד</li>
            <li><strong>זמן עיבוד:</strong> כמה שניות עד דקות (תלוי באורך)</li>
          </ul>
        </div>

        <div style={{ marginBottom: '20px', padding: '20px', border: '1px solid #ddd', borderRadius: '8px' }}>
          <h2>🚀 התחל תמלול</h2>
          
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
              בחר קובץ שמע:
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileSelect}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            />
            {selectedFile && (
              <div style={{ marginTop: '8px', fontSize: '14px', color: '#666' }}>
                נבחר: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                {selectedFile.size > 25 * 1024 * 1024 && (
                  <span style={{ color: 'red', fontWeight: 'bold' }}> - גדול מדי!</span>
                )}
              </div>
            )}
          </div>

          <button
            onClick={startTranscription}
            disabled={loading || !selectedFile || selectedFile.size > 25 * 1024 * 1024}
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
            {loading ? '🔄 מתמלל...' : '🎯 התחל תמלול'}
          </button>
        </div>

        {error && (
          <div style={{ 
            padding: '15px', 
            backgroundColor: '#ffebee', 
            border: '1px solid #f44336',
            borderRadius: '4px',
            color: '#c62828',
            marginBottom: '20px'
          }}>
            <strong>❌ שגיאה:</strong> {error}
          </div>
        )}

        {transcription && (
          <div style={{ 
            padding: '20px', 
            backgroundColor: '#e8f5e8', 
            border: '1px solid #4caf50',
            borderRadius: '4px',
            marginBottom: '20px'
          }}>
            <h3>✅ תוצאת התמלול:</h3>
            {language && (
              <p style={{ fontSize: '14px', color: '#666', marginBottom: '10px' }}>
                <strong>שפה מזוהה:</strong> {language}
              </p>
            )}
            <div style={{ 
              whiteSpace: 'pre-wrap', 
              backgroundColor: 'white',
              padding: '15px',
              borderRadius: '4px',
              border: '1px solid #ddd',
              maxHeight: '400px',
              overflowY: 'auto',
              lineHeight: '1.6',
              fontSize: '16px'
            }}>
              {transcription}
            </div>
          </div>
        )}

        <div style={{ marginTop: '40px', padding: '20px', backgroundColor: '#f8f9fa', borderRadius: '8px' }}>
          <h2>🔧 מידע טכני</h2>
          <ul>
            <li><strong>API:</strong> ElevenLabs Scribe v1</li>
            <li><strong>מצב:</strong> סינכרוני (ללא webhook)</li>
            <li><strong>עיבוד:</strong> ישיר ללא חלוקה לקטעים</li>
            <li><strong>מגבלות:</strong> 25MB, כמה דקות אורך</li>
          </ul>
          
          <p style={{ fontSize: '14px', color: '#666', marginTop: '15px' }}>
            לקבצים גדולים יותר, השתמש בממשק המלא עם webhook ו-ngrok
          </p>
        </div>
      </div>
    </>
  )
}