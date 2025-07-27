/**
 * Test script to verify ElevenLabs API connection
 * Run with: npx ts-node src/scripts/test-elevenlabs.ts
 */

import { elevenLabsService } from '../services/elevenlabs'
import { logger } from '../lib/logger'

async function testElevenLabsAPI() {
  console.log('🧪 Testing ElevenLabs API Connection...\n')

  try {
    // Test 1: Validate API Key
    console.log('1. Testing API Key Validation:')
    const isValidKey = await elevenLabsService.validateApiKey()
    if (isValidKey) {
      console.log('   ✅ API key is valid')
    } else {
      console.log('   ❌ API key is invalid')
      return
    }

    // Test 2: Get User Info
    console.log('\n2. Getting User Information:')
    try {
      const userInfo = await elevenLabsService.getUserInfo()
      console.log('   ✅ User info retrieved:')
      console.log(`      - User ID: ${userInfo.user_id}`)
      console.log(`      - Email: ${userInfo.email || 'N/A'}`)
      console.log(`      - Subscription: ${userInfo.subscription?.tier || 'N/A'}`)
      console.log(`      - Character Count: ${userInfo.subscription?.character_count || 0}`)
      console.log(`      - Character Limit: ${userInfo.subscription?.character_limit || 0}`)
    } catch (error) {
      console.log('   ⚠️  Could not get user info:', (error as Error).message)
    }

    // Test 3: Get Available Models
    console.log('\n3. Getting Available Models:')
    try {
      const models = await elevenLabsService.getModels()
      console.log('   ✅ Available models:')
      models.forEach((model: any) => {
        console.log(`      - ${model.model_id}: ${model.name}`)
        if (model.model_id === 'scribe_v1') {
          console.log('        🎯 This is the Scribe model we\'ll use!')
        }
      })
    } catch (error) {
      console.log('   ⚠️  Could not get models:', (error as Error).message)
    }

    console.log('\n🎉 ElevenLabs API connection test completed!')
    console.log('\n📋 Next Steps:')
    console.log('1. Install ngrok: npm install -g ngrok')
    console.log('2. Start your server: npm run dev')
    console.log('3. In another terminal: ngrok http 3000')
    console.log('4. Visit http://localhost:3000/test-real to test with real audio files')

  } catch (error) {
    console.error('❌ Error testing ElevenLabs API:', error)
    console.log('\n🔧 Troubleshooting:')
    console.log('1. Check your ELEVENLABS_API_KEY in .env.local')
    console.log('2. Make sure your API key has the correct permissions')
    console.log('3. Verify your internet connection')
    process.exit(1)
  }
}

// Run the test
testElevenLabsAPI()