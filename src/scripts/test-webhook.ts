/**
 * Test script to simulate ElevenLabs webhook calls
 * Run with: npx ts-node src/scripts/test-webhook.ts
 */

async function testWebhook() {
  const baseUrl = process.env.WEBHOOK_BASE_URL || 'http://localhost:3000'
  
  // Mock ElevenLabs webhook payload
  const payload = {
    task_id: 'elevenlabs-test-123',
    status: 'completed',
    result: {
      text: 'This is a test transcription from the mock ElevenLabs service.',
      language_code: 'en',
      language_probability: 0.98,
      words: [
        {
          text: 'This',
          start: 0.0,
          end: 0.3,
          type: 'word',
          speaker_id: 'speaker_0'
        },
        {
          text: ' ',
          start: 0.3,
          end: 0.35,
          type: 'spacing',
          speaker_id: 'speaker_0'
        },
        {
          text: 'is',
          start: 0.35,
          end: 0.5,
          type: 'word',
          speaker_id: 'speaker_0'
        }
      ]
    }
  }

  try {
    console.log('Sending test webhook to:', `${baseUrl}/api/webhook/elevenlabs`)
    console.log('Payload:', JSON.stringify(payload, null, 2))

    const response = await fetch(`${baseUrl}/api/webhook/elevenlabs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    })

    const result = await response.json()
    
    console.log('Response status:', response.status)
    console.log('Response body:', result)

  } catch (error) {
    console.error('Error sending webhook:', error)
  }
}

// Run the test
testWebhook()