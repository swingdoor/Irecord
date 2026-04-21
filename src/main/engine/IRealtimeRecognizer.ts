export interface RealtimeSegment {
  text: string
  startTime: number
  endTime: number
}

export interface RecognitionResult {
  text: string
  isFinal: boolean
  startTime: number
  endTime: number
}

export interface IRealtimeRecognizer {
  /**
   * Initialize the recognizer with model and configuration
   */
  initialize(): void

  /**
   * Feed audio data to the recognizer
   * @param audioData Float32Array of audio samples
   * @returns Recognition result if available, null otherwise
   */
  feedAudio(audioData: Float32Array): RecognitionResult | null

  /**
   * Finalize the recording and get all segments
   * @returns Object containing file path and all segments
   */
  finalize(): { filePath: string; segments: RealtimeSegment[] }

  /**
   * Cleanup resources (close files, release models)
   */
  cleanup(): void
}
