import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, openSync, writeSync, closeSync } from 'fs'
import { randomUUID } from 'crypto'
import { OnlineRecognizer, OnlineStream } from 'sherpa-onnx-node'
import { getModelsPath, checkStreamingZipformerModelExists, getStreamingZipformerModelPath } from '../utils/paths'
import { getRealtimeParams } from '../utils/settings'
import { IRealtimeRecognizer, RealtimeSegment, RecognitionResult } from './IRealtimeRecognizer'
import { createWavHeader, writeAudioToWav } from '../audio/wavUtils'

const MAX_RECORDING_DURATION_MS = 30 * 60 * 1000 // 30 minutes

export interface RealtimeRecognizerConfig {
  modelDir: string
  numThreads?: number
}

export class RealtimeRecognizer implements IRealtimeRecognizer {
  private recognizer: OnlineRecognizer | null = null
  private stream: OnlineStream | null = null
  private segments: RealtimeSegment[] = []
  private recordingStartTime: number = 0
  private currentSegmentStart: number = 0
  private sampleRate: number = 16000
  private wavFd: number | null = null
  private wavFilePath: string = ''
  private totalSamplesWritten: number = 0

  constructor(private config: RealtimeRecognizerConfig) {}

  /**
   * Initialize the online recognizer
   */
  initialize(): void {
    if (this.recognizer) {
      throw new Error('Recognizer already initialized')
    }

    const { modelDir, numThreads = 4 } = this.config

    // Check model files exist
    const encoderPath = join(modelDir, 'encoder.int8.onnx')
    const decoderPath = join(modelDir, 'decoder.onnx')
    const joinerPath = join(modelDir, 'joiner.int8.onnx')
    const tokensPath = join(modelDir, 'tokens.txt')

    if (!existsSync(encoderPath) || !existsSync(decoderPath) || !existsSync(joinerPath) || !existsSync(tokensPath)) {
      throw new Error('Streaming model files not found')
    }

    const realtimeParams = getRealtimeParams()

    this.recognizer = new OnlineRecognizer({
      featConfig: { sampleRate: this.sampleRate },
      modelConfig: {
        transducer: {
          encoder: encoderPath,
          decoder: decoderPath,
          joiner: joinerPath
        },
        tokens: tokensPath,
        numThreads,
        provider: 'cpu',
        debug: 0
      },
      enableEndpoint: true,
      rule1MinTrailingSilence: realtimeParams.rule1MinTrailingSilence,
      rule2MinTrailingSilence: realtimeParams.rule2MinTrailingSilence,
      rule3MinUtteranceLength: realtimeParams.rule3MinUtteranceLength,
    })

    this.stream = this.recognizer.createStream()
    this.recordingStartTime = Date.now()

    // Initialize streaming WAV file
    const recordingsDir = join(app.getPath('userData'), 'recordings')
    if (!existsSync(recordingsDir)) {
      mkdirSync(recordingsDir, { recursive: true })
    }
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hour = String(now.getHours()).padStart(2, '0')
    const minute = String(now.getMinutes()).padStart(2, '0')
    const second = String(now.getSeconds()).padStart(2, '0')
    const fileName = `recording_${year}${month}${day}${hour}${minute}${second}.wav`
    this.wavFilePath = join(recordingsDir, fileName)
    this.wavFd = openSync(this.wavFilePath, 'w')
    this.totalSamplesWritten = 0

    // Write placeholder WAV header (44 bytes)
    const placeholderHeader = Buffer.alloc(44)
    writeSync(this.wavFd, placeholderHeader, 0, 44, 0)
  }

  /**
   * Feed audio chunk and decode
   */
  feedAudio(audioData: Float32Array): RecognitionResult | null {
    if (!this.recognizer || !this.stream) {
      throw new Error('Recognizer not initialized')
    }

    // Check 30-minute limit
    if (Date.now() - this.recordingStartTime > MAX_RECORDING_DURATION_MS) {
      throw new Error('Recording duration limit reached (30 minutes)')
    }

    // Stream write audio to WAV file immediately
    if (this.wavFd !== null) {
      const samplesWritten = writeAudioToWav(this.wavFd, audioData, 44 + this.totalSamplesWritten * 2)
      this.totalSamplesWritten += samplesWritten
    }

    // Feed to recognizer
    this.stream.acceptWaveform({
      samples: audioData,
      sampleRate: this.sampleRate
    })

    // Decode while ready
    while (this.recognizer.isReady(this.stream)) {
      this.recognizer.decode(this.stream)
    }

    // Get current result
    const result = this.recognizer.getResult(this.stream)

    // Check endpoint (sentence complete)
    if (this.recognizer.isEndpoint(this.stream)) {
      const finalResult = this.recognizer.getResult(this.stream)

      // Only return if there's actual text content
      if (!finalResult.text || !finalResult.text.trim()) {
        this.recognizer.reset(this.stream)
        return null
      }

      // Use timestamps from recognizer result only
      const startTime = finalResult.start_time
      const endTime = finalResult.timestamps && finalResult.timestamps.length > 0
        ? finalResult.timestamps[finalResult.timestamps.length - 1]
        : finalResult.start_time

      // Save completed segment
      this.segments.push({
        text: finalResult.text,
        startTime,
        endTime
      })

      // Reset stream for next sentence
      this.recognizer.reset(this.stream)

      return { text: finalResult.text, isFinal: true, startTime, endTime }
    }

    // Return intermediate result only if there's text
    if (result.text && result.text.trim()) {
      const startTime = result.start_time
      const endTime = result.timestamps && result.timestamps.length > 0
        ? result.timestamps[result.timestamps.length - 1]
        : result.start_time

      return { text: result.text, isFinal: false, startTime, endTime }
    }

    return null
  }

  /**
   * Finalize recording and get final result
   */
  finalize(): { filePath: string; segments: RealtimeSegment[] } {
    if (!this.recognizer || !this.stream) {
      throw new Error('Recognizer not initialized')
    }

    // Signal input finished
    this.stream.inputFinished()

    // Get final result
    const finalResult = this.recognizer.getResult(this.stream)
    if (finalResult.text) {
      const now = (Date.now() - this.recordingStartTime) / 1000
      this.segments.push({
        text: finalResult.text,
        startTime: this.currentSegmentStart,
        endTime: now
      })
    }

    // Patch WAV header with correct sizes
    if (this.wavFd !== null) {
      const dataSize = this.totalSamplesWritten * 2
      const header = createWavHeader(this.sampleRate, dataSize)
      writeSync(this.wavFd, header, 0, 44, 0)
      closeSync(this.wavFd)
      this.wavFd = null
    }

    return {
      filePath: this.wavFilePath,
      segments: this.segments
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.wavFd !== null) {
      closeSync(this.wavFd)
      this.wavFd = null
    }
    this.recognizer = null
    this.stream = null
    this.segments = []
  }
}

/**
 * Check if streaming model exists
 */
export function checkStreamingModelExists(): boolean {
  return checkStreamingZipformerModelExists()
}

/**
 * Get streaming model directory path
 */
export function getStreamingModelPath(): string {
  return getStreamingZipformerModelPath()
}
