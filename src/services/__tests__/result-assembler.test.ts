import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { resultAssemblerService } from '../result-assembler'
import { Segment } from '@/types'

describe('ResultAssemblerService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('combineSegments', () => {
    it('should combine segments chronologically', async () => {
      const segments: Segment[] = [
        {
          id: '2',
          task_id: 'task-1',
          file_path: '/path/segment2.mp3',
          start_time: 15,
          end_time: 30,
          status: 'completed',
          transcription_text: 'second part',
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: '1',
          task_id: 'task-1',
          file_path: '/path/segment1.mp3',
          start_time: 0,
          end_time: 15,
          status: 'completed',
          transcription_text: 'first part',
          created_at: '2024-01-01T00:00:00Z'
        }
      ]

      const result = await resultAssemblerService.combineSegments(segments)

      expect(result.text).toBe('first part second part')
      expect(result.segments).toHaveLength(2)
      expect(result.segments[0].startTime).toBe(0)
      expect(result.segments[0].text).toBe('first part')
      expect(result.segments[1].startTime).toBe(15)
      expect(result.segments[1].text).toBe('second part')
      expect(result.metadata.totalDuration).toBe(30)
      expect(result.metadata.languageCode).toBe('en')
      expect(result.metadata.confidence).toBe(0.85)
    })

    it('should filter out segments without transcription text', async () => {
      const segments: Segment[] = [
        {
          id: '1',
          task_id: 'task-1',
          file_path: '/path/segment1.mp3',
          start_time: 0,
          end_time: 15,
          status: 'completed',
          transcription_text: 'valid segment',
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: '2',
          task_id: 'task-1',
          file_path: '/path/segment2.mp3',
          start_time: 15,
          end_time: 30,
          status: 'completed',
          transcription_text: null,
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: '3',
          task_id: 'task-1',
          file_path: '/path/segment3.mp3',
          start_time: 30,
          end_time: 45,
          status: 'failed',
          transcription_text: 'failed segment',
          created_at: '2024-01-01T00:00:00Z'
        }
      ]

      const result = await resultAssemblerService.combineSegments(segments)

      expect(result.text).toBe('valid segment')
      expect(result.segments).toHaveLength(1)
      expect(result.segments[0].text).toBe('valid segment')
    })

    it('should handle empty segments array', async () => {
      await expect(resultAssemblerService.combineSegments([])).rejects.toThrow('No segments provided for combination')
    })

    it('should handle segments with no valid transcriptions', async () => {
      const segments: Segment[] = [
        {
          id: '1',
          task_id: 'task-1',
          file_path: '/path/segment1.mp3',
          start_time: 0,
          end_time: 15,
          status: 'failed',
          transcription_text: null,
          created_at: '2024-01-01T00:00:00Z'
        }
      ]

      await expect(resultAssemblerService.combineSegments(segments)).rejects.toThrow('No valid segments with transcription text found')
    })

    it('should trim whitespace from transcription text', async () => {
      const segments: Segment[] = [
        {
          id: '1',
          task_id: 'task-1',
          file_path: '/path/segment1.mp3',
          start_time: 0,
          end_time: 15,
          status: 'completed',
          transcription_text: '  first part  ',
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: '2',
          task_id: 'task-1',
          file_path: '/path/segment2.mp3',
          start_time: 15,
          end_time: 30,
          status: 'completed',
          transcription_text: '  second part  ',
          created_at: '2024-01-01T00:00:00Z'
        }
      ]

      const result = await resultAssemblerService.combineSegments(segments)

      expect(result.text).toBe('first part second part')
    })

    it('should calculate total duration correctly', async () => {
      const segments: Segment[] = [
        {
          id: '1',
          task_id: 'task-1',
          file_path: '/path/segment1.mp3',
          start_time: 5,
          end_time: 20,
          status: 'completed',
          transcription_text: 'first',
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: '2',
          task_id: 'task-1',
          file_path: '/path/segment2.mp3',
          start_time: 25,
          end_time: 40,
          status: 'completed',
          transcription_text: 'second',
          created_at: '2024-01-01T00:00:00Z'
        }
      ]

      const result = await resultAssemblerService.combineSegments(segments)

      // Total duration should be from min start time to max end time
      expect(result.metadata.totalDuration).toBe(35) // 40 - 5 = 35
    })
  })

  describe('validateSegmentsForCombination', () => {
    it('should return ready when all segments are completed', () => {
      const segments: Segment[] = [
        {
          id: '1',
          task_id: 'task-1',
          file_path: '/path/segment1.mp3',
          start_time: 0,
          end_time: 15,
          status: 'completed',
          transcription_text: 'first',
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: '2',
          task_id: 'task-1',
          file_path: '/path/segment2.mp3',
          start_time: 15,
          end_time: 30,
          status: 'completed',
          transcription_text: 'second',
          created_at: '2024-01-01T00:00:00Z'
        }
      ]

      const validation = resultAssemblerService.validateSegmentsForCombination(segments)

      expect(validation.isReady).toBe(true)
      expect(validation.missingSegments).toHaveLength(0)
    })

    it('should return not ready when segments are pending', () => {
      const segments: Segment[] = [
        {
          id: '1',
          task_id: 'task-1',
          file_path: '/path/segment1.mp3',
          start_time: 0,
          end_time: 15,
          status: 'completed',
          transcription_text: 'first',
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: '2',
          task_id: 'task-1',
          file_path: '/path/segment2.mp3',
          start_time: 15,
          end_time: 30,
          status: 'processing',
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: '3',
          task_id: 'task-1',
          file_path: '/path/segment3.mp3',
          start_time: 30,
          end_time: 45,
          status: 'pending',
          created_at: '2024-01-01T00:00:00Z'
        }
      ]

      const validation = resultAssemblerService.validateSegmentsForCombination(segments)

      expect(validation.isReady).toBe(false)
      expect(validation.missingSegments).toContain('2')
      expect(validation.missingSegments).toContain('3')
      expect(validation.missingSegments).toHaveLength(2)
    })

    it('should consider failed segments as ready (not blocking)', () => {
      const segments: Segment[] = [
        {
          id: '1',
          task_id: 'task-1',
          file_path: '/path/segment1.mp3',
          start_time: 0,
          end_time: 15,
          status: 'completed',
          transcription_text: 'first',
          created_at: '2024-01-01T00:00:00Z'
        },
        {
          id: '2',
          task_id: 'task-1',
          file_path: '/path/segment2.mp3',
          start_time: 15,
          end_time: 30,
          status: 'failed',
          error_message: 'Processing failed',
          created_at: '2024-01-01T00:00:00Z'
        }
      ]

      const validation = resultAssemblerService.validateSegmentsForCombination(segments)

      expect(validation.isReady).toBe(true)
      expect(validation.missingSegments).toHaveLength(0)
    })
  })

  describe('createTranscriptionSummary', () => {
    it('should create accurate transcription summary', () => {
      const combinedTranscription = {
        text: 'This is a test transcription with multiple words',
        segments: [
          { startTime: 0, endTime: 15, text: 'This is a test' },
          { startTime: 15, endTime: 30, text: 'transcription with multiple words' }
        ],
        metadata: {
          totalDuration: 30,
          languageCode: 'en',
          confidence: 0.9
        }
      }

      const summary = resultAssemblerService.createTranscriptionSummary(combinedTranscription)

      expect(summary.wordCount).toBe(8) // 8 words in the text
      expect(summary.estimatedReadingTime).toBe(1) // Ceiling of 8/200 minutes
      expect(summary.segmentCount).toBe(2)
      expect(summary.averageSegmentDuration).toBe(15) // 30 seconds / 2 segments
    })

    it('should handle empty transcription', () => {
      const combinedTranscription = {
        text: '',
        segments: [],
        metadata: {
          totalDuration: 0,
          languageCode: 'en',
          confidence: 0
        }
      }

      const summary = resultAssemblerService.createTranscriptionSummary(combinedTranscription)

      expect(summary.wordCount).toBe(0)
      expect(summary.estimatedReadingTime).toBe(0)
      expect(summary.segmentCount).toBe(0)
      expect(summary.averageSegmentDuration).toBe(NaN) // 0/0
    })

    it('should calculate reading time correctly for longer text', () => {
      // Create text with exactly 400 words
      const words = Array(400).fill('word').join(' ')
      
      const combinedTranscription = {
        text: words,
        segments: [{ startTime: 0, endTime: 60, text: words }],
        metadata: {
          totalDuration: 60,
          languageCode: 'en',
          confidence: 0.9
        }
      }

      const summary = resultAssemblerService.createTranscriptionSummary(combinedTranscription)

      expect(summary.wordCount).toBe(400)
      expect(summary.estimatedReadingTime).toBe(2) // 400 words / 200 words per minute = 2 minutes
    })
  })
})