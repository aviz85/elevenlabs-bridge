import { logger } from '../logger'

// Mock console methods
const mockConsole = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

// Replace console methods
Object.assign(console, mockConsole)

describe('Logger', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset NODE_ENV for each test
    process.env.NODE_ENV = 'test'
  })

  describe('debug', () => {
    it('should log debug messages in development', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'development'
      
      logger.debug('Test debug message', { key: 'value' })
      
      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG: Test debug message')
      )
      
      process.env.NODE_ENV = originalEnv
    })

    it('should not log debug messages in production', () => {
      const originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'
      
      logger.debug('Test debug message')
      
      expect(mockConsole.debug).not.toHaveBeenCalled()
      
      process.env.NODE_ENV = originalEnv
    })
  })

  describe('info', () => {
    it('should log info messages', () => {
      logger.info('Test info message', { taskId: '123' })
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('INFO: Test info message')
      )
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('{"taskId":"123"}')
      )
    })
  })

  describe('warn', () => {
    it('should log warning messages', () => {
      logger.warn('Test warning message')
      
      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('WARN: Test warning message')
      )
    })
  })

  describe('error', () => {
    it('should log error messages with error object', () => {
      const error = new Error('Test error')
      logger.error('Test error message', error, { taskId: '123' })
      
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('ERROR: Test error message')
      )
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('"error"')
      )
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('"taskId":"123"')
      )
    })

    it('should log error messages without error object', () => {
      logger.error('Test error message', undefined, { taskId: '123' })
      
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('ERROR: Test error message')
      )
      expect(mockConsole.error).toHaveBeenCalledWith(
        expect.stringContaining('{"taskId":"123"}')
      )
    })
  })

  describe('structured logging in production', () => {
    let originalEnv: string | undefined

    beforeEach(() => {
      originalEnv = process.env.NODE_ENV
      process.env.NODE_ENV = 'production'
    })

    afterEach(() => {
      process.env.NODE_ENV = originalEnv
    })

    it('should output JSON format in production', () => {
      logger.info('Test message', { taskId: '123' })
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringMatching(/^{.*}$/)
      )
      
      const logCall = mockConsole.info.mock.calls[0][0]
      const logEntry = JSON.parse(logCall)
      
      expect(logEntry).toMatchObject({
        level: 'info',
        message: 'Test message',
        environment: 'production',
        service: 'elevenlabs-proxy-server',
        context: { taskId: '123' }
      })
      expect(logEntry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    })

    it('should include error details in structured format', () => {
      const error = new Error('Test error')
      error.stack = 'Error: Test error\n    at test'
      
      logger.error('Test error message', error, { taskId: '123' })
      
      const logCall = mockConsole.error.mock.calls[0][0]
      const logEntry = JSON.parse(logCall)
      
      expect(logEntry.error).toMatchObject({
        message: 'Test error',
        stack: 'Error: Test error\n    at test',
        name: 'Error'
      })
    })
  })

  describe('performance logging', () => {
    it('should log performance metrics', () => {
      logger.performance('database-query', 150, { query: 'SELECT * FROM tasks' })
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('Performance: database-query')
      )
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('"duration":150')
      )
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('"metric":"performance"')
      )
    })
  })

  describe('API request logging', () => {
    it('should log successful API requests as info', () => {
      logger.apiRequest('POST', '/api/transcribe', 200, 500, { taskId: '123' })
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('API POST /api/transcribe')
      )
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('"statusCode":200')
      )
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('"duration":500')
      )
    })

    it('should log failed API requests as warnings', () => {
      logger.apiRequest('POST', '/api/transcribe', 400, 200, { taskId: '123' })
      
      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('API POST /api/transcribe')
      )
      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('"statusCode":400')
      )
    })
  })

  describe('external service logging', () => {
    it('should log successful external service calls', () => {
      logger.externalService('ElevenLabs', 'transcribe', true, 2000, { taskId: '123' })
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('External service: ElevenLabs.transcribe')
      )
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('"success":true')
      )
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('"duration":2000')
      )
    })

    it('should log failed external service calls as warnings', () => {
      logger.externalService('ElevenLabs', 'transcribe', false, 5000, { error: 'timeout' })
      
      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('External service: ElevenLabs.transcribe')
      )
      expect(mockConsole.warn).toHaveBeenCalledWith(
        expect.stringContaining('"success":false')
      )
    })
  })

  describe('business event logging', () => {
    it('should log business events', () => {
      logger.businessEvent('transcription-completed', { taskId: '123', duration: 30000 })
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('Business event: transcription-completed')
      )
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('"event":"transcription-completed"')
      )
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('"metric":"business_event"')
      )
    })
  })

  describe('message formatting', () => {
    it('should include timestamp in log messages', () => {
      logger.info('Test message')
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/)
      )
    })

    it('should format context as JSON in development', () => {
      process.env.NODE_ENV = 'development'
      const context = { taskId: '123', userId: 'user456', nested: { key: 'value' } }
      logger.info('Test message', context)
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining(JSON.stringify(context))
      )
    })
  })
})