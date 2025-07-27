#!/usr/bin/env node

const { spawn } = require('child_process')
const path = require('path')

console.log('🧪 Running ElevenLabs Proxy Server Tests...\n')

// Run Jest with our configuration
const jest = spawn('npx', ['jest', '--verbose', '--coverage'], {
  stdio: 'inherit',
  cwd: process.cwd()
})

jest.on('close', (code) => {
  if (code === 0) {
    console.log('\n✅ All tests passed!')
  } else {
    console.log('\n❌ Some tests failed!')
    process.exit(code)
  }
})