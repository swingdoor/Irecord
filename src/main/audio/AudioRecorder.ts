import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, openSync, writeSync, closeSync, statSync } from 'fs'
import { createWavHeader, writeAudioToWav } from './wavUtils'

const MAX_RECORDING_DURATION_MS = 120 * 60 * 1000 // 120 minutes

export interface AudioRecorderResult {
  filePath: string
  duration: number
  fileSize: number
}

/**
 * Pure audio recorder that writes WAV files without any transcription
 */
export class AudioRecorder {
  private recordingStartTime: number = 0
  private sampleRate: number = 16000
  private wavFd: number | null = null
  private wavFilePath: string = ''
  private totalSamplesWritten: number = 0
  private finalized: boolean = false

  /**
   * Initialize the recorder and create WAV file
   */
  initialize(): void {
    if (this.wavFd !== null) {
      throw new Error('Recorder already initialized')
    }

    this.recordingStartTime = Date.now()
    this.finalized = false

    // Create recordings directory if not exists
    const recordingsDir = join(app.getPath('userData'), 'recordings')
    if (!existsSync(recordingsDir)) {
      mkdirSync(recordingsDir, { recursive: true })
    }

    // Generate timestamped filename
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hour = String(now.getHours()).padStart(2, '0')
    const minute = String(now.getMinutes()).padStart(2, '0')
    const second = String(now.getSeconds()).padStart(2, '0')
    const fileName = `recording_${year}${month}${day}${hour}${minute}${second}.wav`
    this.wavFilePath = join(recordingsDir, fileName)

    // Open file and write placeholder header
    this.wavFd = openSync(this.wavFilePath, 'w')
    this.totalSamplesWritten = 0

    // Write placeholder WAV header (44 bytes)
    const placeholderHeader = Buffer.alloc(44)
    writeSync(this.wavFd, placeholderHeader, 0, 44, 0)
  }

  /**
   * Feed audio chunk and write to WAV file
   */
  feedAudio(audioData: Float32Array): void {
    if (this.wavFd === null) {
      throw new Error('Recorder not initialized')
    }

    if (this.finalized) {
      throw new Error('Recorder already finalized')
    }

    // Check 120-minute limit
    if (Date.now() - this.recordingStartTime > MAX_RECORDING_DURATION_MS) {
      throw new Error('Recording duration limit reached (120 minutes)')
    }

    // Stream write audio to WAV file immediately
    const samplesWritten = writeAudioToWav(this.wavFd, audioData, 44 + this.totalSamplesWritten * 2)
    this.totalSamplesWritten += samplesWritten
  }

  /**
   * Finalize recording and patch WAV header
   */
  finalize(): AudioRecorderResult {
    if (this.wavFd === null) {
      throw new Error('Recorder not initialized')
    }

    if (this.finalized) {
      throw new Error('Recorder already finalized')
    }

    // Patch WAV header with correct sizes
    const dataSize = this.totalSamplesWritten * 2
    const header = createWavHeader(this.sampleRate, dataSize)
    writeSync(this.wavFd, header, 0, 44, 0)
    closeSync(this.wavFd)
    this.wavFd = null
    this.finalized = true

    // Calculate duration and file size
    const duration = (Date.now() - this.recordingStartTime) / 1000
    const fileSize = existsSync(this.wavFilePath) ? statSync(this.wavFilePath).size : 0

    return {
      filePath: this.wavFilePath,
      duration,
      fileSize
    }
  }

  /**
   * Cleanup resources (close file if not finalized)
   */
  cleanup(): void {
    if (this.wavFd !== null) {
      try {
        closeSync(this.wavFd)
      } catch (err) {
        // Ignore errors during cleanup
      }
      this.wavFd = null
    }
  }
}
