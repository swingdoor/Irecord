import { writeSync } from 'fs'

/**
 * Create WAV file header
 */
export function createWavHeader(sampleRate: number, dataSize: number, numChannels = 1, bitsPerSample = 16): Buffer {
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
  buffer.writeUInt16LE(1, 20) // PCM format
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

/**
 * Convert Float32Array audio samples to Int16 PCM buffer
 */
export function float32ToInt16Buffer(audioData: Float32Array): Buffer {
  const int16Buf = Buffer.alloc(audioData.length * 2)
  for (let i = 0; i < audioData.length; i++) {
    const sample = Math.max(-1, Math.min(1, audioData[i]))
    const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
    int16Buf.writeInt16LE(int16, i * 2)
  }
  return int16Buf
}

/**
 * Write audio samples to WAV file at specified position
 */
export function writeAudioToWav(fd: number, audioData: Float32Array, position: number): number {
  const int16Buf = float32ToInt16Buffer(audioData)
  writeSync(fd, int16Buf, 0, int16Buf.length, position)
  return audioData.length
}
