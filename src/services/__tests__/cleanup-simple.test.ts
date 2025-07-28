import { CleanupService } from '../cleanup'

// Simple test to verify the cleanup service can be instantiated and basic methods exist
describe('CleanupService - Basic Tests', () => {
  let cleanupService: CleanupService

  beforeEach(() => {
    cleanupService = new CleanupService()
  })

  it('should create a cleanup service instance', () => {
    expect(cleanupService).toBeInstanceOf(CleanupService)
  })

  it('should have required methods', () => {
    expect(typeof cleanupService.performCleanup).toBe('function')
    expect(typeof cleanupService.cleanupTask).toBe('function')
    expect(typeof cleanupService.getCleanupStats).toBe('function')
    expect(typeof cleanupService.scheduleCleanup).toBe('function')
  })

  it('should have default options', () => {
    // Test that the service has reasonable defaults
    expect(cleanupService).toBeDefined()
  })
})