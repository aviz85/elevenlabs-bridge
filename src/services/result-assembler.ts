import { Segment, CombinedTranscription } from '@/types'
import { logger } from '@/lib/logger'
import { ValidationError } from '@/lib/errors'

export class ResultAssemblerService {
  /**
   * Combine segment transcriptions chronologically
   */
  async combineSegments(segments: Segment[]): Promise<CombinedTranscription> {
    logger.info('Combining segment transcriptions', { segmentCount: segments.length })

    if (segments.length === 0) {
      throw new ValidationError('No segments provided for combination')
    }

    // Filter out segments without transcription text
    const validSegments = segments.filter(segment => 
      segment.transcription_text && segment.status === 'completed'
    )

    if (validSegments.length === 0) {
      throw new ValidationError('No valid segments with transcription text found')
    }

    // Sort segments chronologically by start time
    const sortedSegments = validSegments.sort((a, b) => a.start_time - b.start_time)

    // Validate segment continuity (optional - log warnings for gaps)
    this.validateSegmentContinuity(sortedSegments)

    // Combine transcription text
    const combinedText = sortedSegments
      .map(segment => segment.transcription_text?.trim())
      .filter(Boolean)
      .join(' ')

    // Calculate metadata
    const totalDuration = this.calculateTotalDuration(sortedSegments)
    const averageConfidence = this.calculateAverageConfidence(sortedSegments)
    const detectedLanguage = this.detectPrimaryLanguage(sortedSegments)

    const result: CombinedTranscription = {
      text: combinedText,
      segments: sortedSegments.map(segment => ({
        startTime: segment.start_time,
        endTime: segment.end_time,
        text: segment.transcription_text || ''
      })),
      metadata: {
        totalDuration,
        languageCode: detectedLanguage,
        confidence: averageConfidence
      }
    }

    logger.info('Segments combined successfully', {
      totalSegments: sortedSegments.length,
      totalDuration,
      textLength: combinedText.length,
      languageCode: detectedLanguage,
      confidence: averageConfidence
    })

    return result
  }

  /**
   * Validate that segments are continuous (log warnings for gaps)
   */
  private validateSegmentContinuity(segments: Segment[]): void {
    for (let i = 1; i < segments.length; i++) {
      const prevSegment = segments[i - 1]
      const currentSegment = segments[i]
      
      const gap = currentSegment.start_time - prevSegment.end_time
      
      // Allow small gaps (up to 1 second) due to processing variations
      if (gap > 1.0) {
        logger.warn('Gap detected between segments', {
          prevSegmentId: prevSegment.id,
          currentSegmentId: currentSegment.id,
          prevEndTime: prevSegment.end_time,
          currentStartTime: currentSegment.start_time,
          gapDuration: gap
        })
      }
      
      // Check for overlapping segments
      if (gap < 0) {
        logger.warn('Overlapping segments detected', {
          prevSegmentId: prevSegment.id,
          currentSegmentId: currentSegment.id,
          prevEndTime: prevSegment.end_time,
          currentStartTime: currentSegment.start_time,
          overlapDuration: Math.abs(gap)
        })
      }
    }
  }

  /**
   * Calculate total duration from segments
   */
  private calculateTotalDuration(segments: Segment[]): number {
    if (segments.length === 0) return 0
    
    // Find the maximum end time across all segments
    const maxEndTime = Math.max(...segments.map(s => s.end_time))
    const minStartTime = Math.min(...segments.map(s => s.start_time))
    
    return maxEndTime - minStartTime
  }

  /**
   * Calculate average confidence score (placeholder - would need actual confidence data)
   */
  private calculateAverageConfidence(segments: Segment[]): number {
    // For now, return a default confidence score
    // In a real implementation, this would be calculated from actual confidence scores
    // returned by ElevenLabs API
    return 0.85
  }

  /**
   * Detect primary language from segments (placeholder)
   */
  private detectPrimaryLanguage(segments: Segment[]): string {
    // For now, return default language
    // In a real implementation, this would analyze the language detection results
    // from ElevenLabs API responses
    return 'en'
  }

  /**
   * Validate that all segments are ready for combination
   */
  validateSegmentsForCombination(segments: Segment[]): { isReady: boolean; missingSegments: string[] } {
    const completedSegments = segments.filter(s => s.status === 'completed')
    const failedSegments = segments.filter(s => s.status === 'failed')
    const pendingSegments = segments.filter(s => s.status === 'pending' || s.status === 'processing')

    const missingSegments = pendingSegments.map(s => s.id)

    logger.info('Validating segments for combination', {
      totalSegments: segments.length,
      completedSegments: completedSegments.length,
      failedSegments: failedSegments.length,
      pendingSegments: pendingSegments.length
    })

    return {
      isReady: pendingSegments.length === 0,
      missingSegments
    }
  }

  /**
   * Create a summary of the transcription result
   */
  createTranscriptionSummary(combinedTranscription: CombinedTranscription): {
    wordCount: number
    estimatedReadingTime: number
    segmentCount: number
    averageSegmentDuration: number
  } {
    const wordCount = combinedTranscription.text.split(/\s+/).filter(word => word.length > 0).length
    const estimatedReadingTime = Math.ceil(wordCount / 200) // Assuming 200 words per minute reading speed
    const segmentCount = combinedTranscription.segments.length
    const averageSegmentDuration = combinedTranscription.metadata.totalDuration / segmentCount

    return {
      wordCount,
      estimatedReadingTime,
      segmentCount,
      averageSegmentDuration
    }
  }
}

export const resultAssemblerService = new ResultAssemblerService()