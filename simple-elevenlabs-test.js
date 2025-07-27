#!/usr/bin/env node

const { default: fetch } = require('node-fetch');

async function testElevenLabsAPI() {
  console.log('🧪 Testing ElevenLabs API directly...\n');

  const apiKey = 'sk_63273dc2fb5b982fa618983c924954749908381a638d1566';
  
  if (!apiKey || apiKey === 'your_elevenlabs_api_key') {
    console.error('❌ Please set a valid ElevenLabs API key');
    return;
  }

  try {
    // Test API key validation
    console.log('1. Testing API key validation...');
    const response = await fetch('https://api.elevenlabs.io/v1/user', {
      headers: {
        'xi-api-key': apiKey
      }
    });

    if (response.ok) {
      const userData = await response.json();
      console.log('   ✅ API key is valid!');
      console.log('   📊 User info:');
      console.log(`      - User ID: ${userData.user_id}`);
      console.log(`      - Email: ${userData.email || 'N/A'}`);
      console.log(`      - Subscription: ${userData.subscription?.tier || 'N/A'}`);
      console.log(`      - Character Count: ${userData.subscription?.character_count || 0}`);
      console.log(`      - Character Limit: ${userData.subscription?.character_limit || 0}`);
    } else {
      console.error('   ❌ API key validation failed:', response.status, response.statusText);
      return;
    }

    // Test getting models
    console.log('\n2. Testing available models...');
    const modelsResponse = await fetch('https://api.elevenlabs.io/v1/models', {
      headers: {
        'xi-api-key': apiKey
      }
    });

    if (modelsResponse.ok) {
      const models = await modelsResponse.json();
      console.log('   ✅ Available models:');
      models.forEach(model => {
        console.log(`      - ${model.model_id}: ${model.name}`);
        if (model.model_id === 'scribe_v1') {
          console.log('        🎯 This is the Scribe model for transcription!');
        }
      });
    } else {
      console.error('   ⚠️  Could not get models:', modelsResponse.status, modelsResponse.statusText);
    }

    console.log('\n🎉 ElevenLabs API test completed successfully!');
    console.log('\n📋 The API is working. The issue with your app is likely:');
    console.log('1. Missing or incorrect Supabase service role key');
    console.log('2. Database connection issues');
    console.log('3. Missing database tables/schema');

  } catch (error) {
    console.error('❌ Error testing ElevenLabs API:', error.message);
  }
}

testElevenLabsAPI();