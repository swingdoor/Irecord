import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, openSync, writeSync, closeSync } from 'fs'
import { randomUUID } from 'crypto'
import { OfflineRecognizer, Vad } from 'sherpa-onnx-node'
import { getModelsPath } from '../utils/paths'
import { IRealtimeRecognizer, RealtimeSegment, RecognitionResult } from './IRealtimeRecognizer'
import { Qwen3RealtimeParams } from '../utils/settings'
import { createWavHeader, writeAudioToWav } from '../audio/wavUtils'

const MAX_RECORDING_DURATION_MS = 30 * 60 * 1000 // 30 minutes

export interface Qwen3RealtimeRecognizerConfig {
  qwen3ModelDir: string
  vadModelPath: string
  params: Qwen3RealtimeParams
  numThreads?: number
}

export class Qwen3RealtimeRecognizer implements IRealtimeRecognizer {
  private recognizer: OfflineRecognizer | null = null
  private vad: Vad | null = null
  private segments: RealtimeSegment[] = []
  private speechBuffer: Float32Array[] = []
  private recordingStartTime: number = 0
  private currentSegmentStartTime: number = 0
  private sampleRate: number = 16000
  private wavFd: number | null = null
  private wavFilePath: string = ''
  private totalSamplesWritten: number = 0
  private isSpeechActive: boolean = false
  private totalSamplesProcessed: number = 0

  constructor(private config: Qwen3RealtimeRecognizerConfig) {}

  initialize(): void {
    if (this.recognizer) {
      throw new Error('Recognizer already initialized')
    }

    const { qwen3ModelDir, vadModelPath, params, numThreads = 4 } = this.config

    // Initialize Silero VAD
    this.vad = new Vad({
      sileroVad: {
        model: vadModelPath,
        threshold: params.vadThreshold,
        minSilenceDuration: params.vadMinSilenceDuration,
        minSpeechDuration: 0.25,
        windowSize: 512,
        maxSpeechDuration: params.vadMaxSpeechDuration
      },
      sampleRate: this.sampleRate,
      numThreads: 1,
      provider: 'cpu',
      debug: false
    }, 60) // 60 seconds buffer

    // Initialize Qwen3-ASR OfflineRecognizer
    const convFrontendPath = join(qwen3ModelDir, 'conv_frontend.onnx')
    const encoderPath = join(qwen3ModelDir, 'encoder.int8.onnx')
    const decoderPath = join(qwen3ModelDir, 'decoder.int8.onnx')
    const tokenizerPath = join(qwen3ModelDir, 'tokenizer')

    if (!existsSync(convFrontendPath) || !existsSync(encoderPath) || !existsSync(decoderPath)) {
      throw new Error('Qwen3-ASR model files not found')
    }

    this.recognizer = new OfflineRecognizer({
      modelConfig: {
        qwen3Asr: {
          convFrontend: convFrontendPath,
          encoder: encoderPath,
          decoder: decoderPath,
          tokenizer: tokenizerPath,
          maxTotalLen: 4096,
          maxNewTokens: 512
        },
        tokens: '',
        numThreads,
        provider: 'cpu',
        debug: false
      }
    })

    // Initialize WAV file
    const recordingsDir = join(app.getPath('userData'), 'recordings')
    if (!existsSync(recordingsDir)) {
      mkdirSync(recordingsDir, { recursive: true })
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    this.wavFilePath = join(recordingsDir, `realtime_${timestamp}_${randomUUID().slice(0, 8)}.wav`)

    // Create WAV file with header
    this.wavFd = openSync(this.wavFilePath, 'w')
    const header = createWavHeader(this.sampleRate, 0)
    writeSync(this.wavFd, header, 0, 44, 0)

    this.recordingStartTime = Date.now()
  }

  feedAudio(audioData: Float32Array): RecognitionResult | null {
    if (!this.recognizer || !this.vad) {
      throw new Error('Recognizer not initialized')
    }

    // Check 30-minute limit
    if (Date.now() - this.recordingStartTime > MAX_RECORDING_DURATION_MS) {
      throw new Error('Recording duration limit reached (30 minutes)')
    }

    // Write original audio to WAV file
    if (this.wavFd !== null) {
      const samplesWritten = writeAudioToWav(this.wavFd, audioData, 44 + this.totalSamplesWritten * 2)
      this.totalSamplesWritten += samplesWritten
    }

    // Feed audio to VAD
    this.vad.acceptWaveform(audioData)
    this.totalSamplesProcessed += audioData.length

    // Check if VAD detected speech segments
    let lastResult: RecognitionResult | null = null

    while (!this.vad.isEmpty() && this.vad.isDetected()) {
      const segment = this.vad.front(false) // false = don't use external buffer
      this.vad.pop()

      // Transcribe the speech segment
      const stream = this.recognizer.createStream()
      stream.acceptWaveform({
        samples: segment.samples,
        sampleRate: this.sampleRate
      })

      this.recognizer.decode(stream)
      const result = this.recognizer.getResult(stream)

      if (result && result.text && result.text.trim()) {
        const startTime = segment.start / this.sampleRate
        const endTime = (segment.start + segment.samples.length) / this.sampleRate

        this.segments.push({
          text: result.text,
          startTime,
          endTime
        })

        lastResult = {
          text: result.text,
          isFinal: true,
          startTime,
          endTime
        }
      }
    }

    return lastResult
  }

  finalize(): { filePath: string; segments: RealtimeSegment[] } {
    if (!this.recognizer || !this.vad) {
      throw new Error('Recognizer not initialized')
    }

    // Flush VAD to get any remaining speech
    this.vad.flush()

    while (!this.vad.isEmpty() && this.vad.isDetected()) {
      const segment = this.vad.front(false) // false = don't use external buffer
      this.vad.pop()

      const stream = this.recognizer.createStream()
      stream.acceptWaveform({
        samples: segment.samples,
        sampleRate: this.sampleRate
      })

      this.recognizer.decode(stream)
      const result = this.recognizer.getResult(stream)

      if (result && result.text && result.text.trim()) {
        const startTime = segment.start / this.sampleRate
        const endTime = (segment.start + segment.samples.length) / this.sampleRate

        this.segments.push({
          text: result.text,
          startTime,
          endTime
        })
      }
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

  cleanup(): void {
    if (this.wavFd !== null) {
      closeSync(this.wavFd)
      this.wavFd = null
    }
    this.recognizer = null
    this.vad = null
    this.segments = []
    this.speechBuffer = []
  }
}

