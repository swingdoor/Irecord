import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, openSync, writeSync, closeSync } from 'fs'
import { randomUUID } from 'crypto'
import { OfflineRecognizer, Vad } from 'sherpa-onnx-node'
import { getModelsPath } from '../utils/paths'
import { IRealtimeRecognizer, RealtimeSegment, RecognitionResult } from './IRealtimeRecognizer'
import { Qwen3RealtimeParams } from '../utils/settings'

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
    console.log('[Qwen3Realtime] Initializing Silero VAD:', vadModelPath)
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
    console.log('[Qwen3Realtime] Initializing Qwen3-ASR:', qwen3ModelDir)

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
    const header = this.createWavHeader(this.sampleRate, 0)
    writeSync(this.wavFd, header, 0, 44, 0)

    this.recordingStartTime = Date.now()
    console.log('[Qwen3Realtime] Initialized successfully')
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
      const int16Buf = Buffer.alloc(audioData.length * 2)
      for (let i = 0; i < audioData.length; i++) {
        const sample = Math.max(-1, Math.min(1, audioData[i]))
        const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
        int16Buf.writeInt16LE(int16, i * 2)
      }
      writeSync(this.wavFd, int16Buf, 0, int16Buf.length, 44 + this.totalSamplesWritten * 2)
      this.totalSamplesWritten += audioData.length
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

        console.log('[Qwen3Realtime] Segment recognized:', {
          text: result.text,
          startTime: startTime.toFixed(2),
          endTime: endTime.toFixed(2)
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
      const header = this.createWavHeader(this.sampleRate, dataSize)
      writeSync(this.wavFd, header, 0, 44, 0)
      closeSync(this.wavFd)
      this.wavFd = null
      console.log('[Qwen3Realtime] WAV file written:', {
        path: this.wavFilePath,
        samples: this.totalSamplesWritten,
        dataSize,
        duration: (this.totalSamplesWritten / this.sampleRate).toFixed(2)
      })
    }

    console.log('[Qwen3Realtime] Finalized:', {
      segments: this.segments.length,
      totalDuration: (this.totalSamplesWritten / this.sampleRate).toFixed(2)
    })

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

  private createWavHeader(sampleRate: number, dataSize: number): Buffer {
    const numChannels = 1
    const bitsPerSample = 16
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
    const blockAlign = numChannels * (bitsPerSample / 8)

    const buffer = Buffer.alloc(44)

    // RIFF header
    buffer.write('RIFF', 0)
    buffer.writeUInt32LE(36 + dataSize, 4)
    buffer.write('WAVE', 8)

    // fmt chunk
    buffer.write('fmt ', 12)
    buffer.writeUInt32LE(16, 16)
    buffer.writeUInt16LE(1, 20)
    buffer.writeUInt16LE(numChannels, 22)
    buffer.writeUInt32LE(sampleRate, 24)
    buffer.writeUInt32LE(byteRate, 28)
    buffer.writeUInt16LE(blockAlign, 32)
    buffer.writeUInt16LE(bitsPerSample, 34)

    // data chunk
    buffer.write('data', 36)
    buffer.writeUInt32LE(dataSize, 40)

    return buffer
  }
}

