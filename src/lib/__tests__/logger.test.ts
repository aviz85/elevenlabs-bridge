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
      process.env.NODE_ENV = 'development'
      logger.debug('Test debug message', { key: 'value' })
      
      expect(mockConsole.debug).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG: Test debug message')
      )
    })

    it('should not log debug messages in production', () => {
      process.env.NODE_ENV = 'production'
      logger.debug('Test debug message')
      
      expect(mockConsole.debug).not.toHaveBeenCalled()
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
        expect.stringContaining('"error":"Test error"')
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

  describe('message formatting', () => {
    it('should include timestamp in log messages', () => {
      logger.info('Test message')
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/)
      )
    })

    it('should format context as JSON', () => {
      const context = { taskId: '123', userId: 'user456', nested: { key: 'value' } }
      logger.info('Test message', context)
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining(JSON.stringify(context))
      )
    })
  })
})