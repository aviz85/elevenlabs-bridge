import { mockAudioService } from '../mock-audio'

describe('MockAudioService', () => {
  describe('convertToMp3', () => {
    it('should convert file to MP3 format', async () => {
      const file = new File(['test content'], 'test.wav', { type: 'audio/wav' })
      
      const result = await mockAudioService.convertToMp3(file)
      
      expect(result).toHaveProperty('buffer')
      expect(result).toHaveProperty('filePath')
      expect(result.buffer).toBeInstanceOf(Buffer)
      expect(result.filePath).toMatch(/^converted\/\d+-test\.mp3$/)
      expect(result.buffer.toString()).toMatch(/^mock-mp3-data-\d+$/)
    })

    it('should handle different file types', async () => {
      const file = new File(['video content'], 'test.mp4', { type: 'video/mp4' })
      
      const result = await mockAudioService.convertToMp3(file)
      
      expect(result.filePath).toMatch(/^converted\/\d+-test\.mp3$/)
    })

    it('should generate unique file paths', async () => {
      const file1 = new File(['content1'], 'test1.wav', { type: 'audio/wav' })
      const file2 = new File(['content2'], 'test2.wav', { type: 'audio/wav' })
      
      const [result1, result2] = await Promise.all([
        mockAudioService.convertToMp3(file1),
        mockAudioService.convertToMp3(file2)
      ])
      
      expect(result1.filePath).not.toBe(result2.filePath)
    })
  })

  describe('getAudioDuration', () => {
    it('should return estimated duration based on file size', async () => {
      const smallFile = new File(['small'], 'small.mp3', { type: 'audio/mp3' })
      const largeContent = new Array(1024 * 1024).fill('a').join('') // 1MB
      const largeFile = new File([largeContent], 'large.mp3', { type: 'audio/mp3' })
      
      const smallDuration = await mockAudioService.getAudioDuration(smallFile)
      const largeDuration = await mockAudioService.getAudioDuration(largeFile)
      
      expect(smallDuration).toBeGreaterThanOrEqual(60) // Minimum 60 seconds
      expect(largeDuration).toBeGreaterThan(smallDuration)
      expect(typeof smallDuration).toBe('number')
      expect(typeof largeDuration).toBe('number')
    })

    it('should return minimum duration of 60 seconds', async () => {
      const tinyFile = new File(['tiny'], 'tiny.mp3', { type: 'audio/mp3' })
      
      const duration = await mockAudioService.getAudioDuration(tinyFile)
      
      expect(duration).toBeGreaterThanOrEqual(60)
    })
  })

  describe('splitAudio', () => {
    it('should split audio into 15-minute segments by default', async () => {
      const filePath = 'test.mp3'
      const totalDuration = 1800 // 30 minutes
      
      const segments = await mockAudioService.splitAudio(filePath, totalDuration)
      
      expect(segments).toHaveLength(2)
      expect(segments[0]).toEqual({
        id: 'segment-0',
        startTime: 0,
        endTime: 900,
        duration: 900,
        filePath: 'test.mp3-segment-0.mp3'
      })
      expect(segments[1]).toEqual({
        id: 'segment-1',
        startTime: 900,
        endTime: 1800,
        duration: 900,
        filePath: 'test.mp3-segment-1.mp3'
      })
    })

    it('should handle custom segment duration', async () => {
      const filePath = 'test.mp3'
      const totalDuration = 1200 // 20 minutes
      const segmentDuration = 600 // 10 minutes
      
      const segments = await mockAudioService.splitAudio(filePath, totalDuration, segmentDuration)
      
      expect(segments).toHaveLength(2)
      expect(segments[0].duration).toBe(600)
      expect(segments[1].duration).toBe(600)
    })

    it('should handle audio shorter than segment duration', async () => {
      const filePath = 'short.mp3'
      const totalDuration = 300 // 5 minutes
      
      const segments = await mockAudioService.splitAudio(filePath, totalDuration)
      
      expect(segments).toHaveLength(1)
      expect(segments[0]).toEqual({
        id: 'segment-0',
        startTime: 0,
        endTime: 300,
        duration: 300,
        filePath: 'short.mp3-segment-0.mp3'
      })
    })

    it('should handle partial last segment', async () => {
      const filePath = 'test.mp3'
      const totalDuration = 1350 // 22.5 minutes
      
      const segments = await mockAudioService.splitAudio(filePath, totalDuration)
      
      expect(segments).toHaveLength(2)
      expect(segments[0].duration).toBe(900) // Full 15 minutes
      expect(segments[1].duration).toBe(450) // Partial 7.5 minutes
      expect(segments[1].endTime).toBe(1350)
    })

    it('should generate sequential segment IDs and file paths', async () => {
      const filePath = 'test.mp3'
      const totalDuration = 2700 // 45 minutes
      
      const segments = await mockAudioService.splitAudio(filePath, totalDuration)
      
      expect(segments).toHaveLength(3)
      expect(segments[0].id).toBe('segment-0')
      expect(segments[1].id).toBe('segment-1')
      expect(segments[2].id).toBe('segment-2')
      expect(segments[0].filePath).toBe('test.mp3-segment-0.mp3')
      expect(segments[1].filePath).toBe('test.mp3-segment-1.mp3')
      expect(segments[2].filePath).toBe('test.mp3-segment-2.mp3')
    })
  })

  describe('uploadToStorage', () => {
    it('should simulate file upload and return storage URL', async () => {
      const buffer = Buffer.from('test file content')
      const filePath = 'uploads/test.mp3'
      
      const storageUrl = await mockAudioService.uploadToStorage(buffer, filePath)
      
      expect(storageUrl).toBe('https://mock-storage.supabase.co/storage/v1/object/public/audio-files/uploads/test.mp3')
    })

    it('should handle different file paths', async () => {
      const buffer = Buffer.from('content')
      const filePath = 'segments/audio-segment-1.mp3'
      
      const storageUrl = await mockAudioService.uploadToStorage(buffer, filePath)
      
      expect(storageUrl).toContain('segments/audio-segment-1.mp3')
    })
  })

  describe('deleteFromStorage', () => {
    it('should simulate file deletion', async () => {
      const filePath = 'uploads/test.mp3'
      
      // Should not throw
      await expect(mockAudioService.deleteFromStorage(filePath)).resolves.toBeUndefined()
    })
  })

  describe('timing simulation', () => {
    it('should simulate realistic processing times', async () => {
      const file = new File(['test'], 'test.mp3', { type: 'audio/mp3' })
      
      const start = Date.now()
      await mockAudioService.convertToMp3(file)
      const convertTime = Date.now() - start
      
      const start2 = Date.now()
      await mockAudioService.getAudioDuration(file)
      const durationTime = Date.now() - start2
      
      const start3 = Date.now()
      await mockAudioService.splitAudio('test.mp3', 900)
      const splitTime = Date.now() - start3
      
      // Check that operations take some time (simulating real processing)
      expect(convertTime).toBeGreaterThanOrEqual(1000) // ~1 second
      expect(durationTime).toBeGreaterThanOrEqual(500) // ~0.5 seconds
      expect(splitTime).toBeGreaterThanOrEqual(2000) // ~2 seconds
    })
  })
})