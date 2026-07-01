import { openSync, readSync, closeSync, statSync } from 'fs'

export interface WavInfo {
  duration: number
  format: 'wav'
  sampleRate: number
  channels: number
  bitsPerSample: number
  byteRate: number
  dataBytes: number
  sampleCount: number
  codec: string
  bitRate: number
}

function readChunkHeader(fd: number, offset: number): { id: string; size: number } {
  const header = Buffer.alloc(8)
  readSync(fd, header, 0, 8, offset)
  return {
    id: header.toString('ascii', 0, 4),
    size: header.readUInt32LE(4),
  }
}

/**
 * 读取 PCM WAV 头信息。当前预处理会产出 16 kHz mono pcm_s16le WAV，
 * 这里保留完整字段用于校验与 UI 时长展示。
 */
export function readWavInfo(filePath: string): WavInfo {
  const fd = openSync(filePath, 'r')
  try {
    const riff = Buffer.alloc(12)
    readSync(fd, riff, 0, 12, 0)
    if (riff.toString('ascii', 0, 4) !== 'RIFF' || riff.toString('ascii', 8, 12) !== 'WAVE') {
      throw new Error('不是有效的 WAV 文件')
    }

    const fileSize = statSync(filePath).size
    let offset = 12
    let sampleRate = 0
    let channels = 0
    let bitsPerSample = 0
    let byteRate = 0
    let audioFormat = 0
    let dataBytes = 0

    while (offset + 8 <= fileSize) {
      const { id, size } = readChunkHeader(fd, offset)
      const chunkDataOffset = offset + 8

      if (id === 'fmt ') {
        const fmt = Buffer.alloc(Math.min(size, 40))
        readSync(fd, fmt, 0, fmt.length, chunkDataOffset)
        audioFormat = fmt.readUInt16LE(0)
        channels = fmt.readUInt16LE(2)
        sampleRate = fmt.readUInt32LE(4)
        byteRate = fmt.readUInt32LE(8)
        bitsPerSample = fmt.readUInt16LE(14)
      } else if (id === 'data') {
        dataBytes = size
        break
      }

      offset = chunkDataOffset + size + (size % 2)
    }

    if (!sampleRate || !channels || !bitsPerSample || !dataBytes) {
      throw new Error('WAV 头缺少必要音频信息')
    }
    if (audioFormat !== 1) {
      throw new Error(`不支持的 WAV 编码: ${audioFormat}`)
    }

    const bytesPerSampleFrame = channels * (bitsPerSample / 8)
    const sampleCount = Math.floor(dataBytes / bytesPerSampleFrame)
    const duration = sampleCount / sampleRate

    return {
      duration,
      format: 'wav',
      sampleRate,
      channels,
      bitsPerSample,
      byteRate,
      dataBytes,
      sampleCount,
      codec: `pcm_s${bitsPerSample}le`,
      bitRate: byteRate * 8,
    }
  } finally {
    closeSync(fd)
  }
}
