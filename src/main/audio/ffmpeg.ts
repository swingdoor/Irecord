import ffmpeg from 'fluent-ffmpeg'
import { getFfmpegPath, getFfprobePath } from '../utils/paths'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

// 设置 FFmpeg 和 FFprobe 路径
ffmpeg.setFfmpegPath(getFfmpegPath())
ffmpeg.setFfprobePath(getFfprobePath())

export interface AudioInfo {
  duration: number      // 秒
  format: string        // 格式名称
  sampleRate: number    // 采样率
  channels: number      // 声道数
  bitRate: number       // 比特率
  codec: string         // 编解码器
}

/**
 * 获取音频/视频文件信息
 */
export function getAudioInfo(filePath: string): Promise<AudioInfo> {
  return new Promise((resolve, reject) => {
    // Ensure file path is properly encoded for ffprobe
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        console.error('FFprobe error for file:', filePath, err)
        reject(new Error(`无法读取文件信息: ${err.message}`))
        return
      }

      const audioStream = metadata.streams.find(s => s.codec_type === 'audio')
      if (!audioStream) {
        reject(new Error('该文件不包含音频'))
        return
      }

      resolve({
        duration: metadata.format.duration || 0,
        format: metadata.format.format_name || 'unknown',
        sampleRate: audioStream.sample_rate ? parseInt(String(audioStream.sample_rate)) : 0,
        channels: audioStream.channels || 0,
        bitRate: metadata.format.bit_rate ? parseInt(String(metadata.format.bit_rate)) : 0,
        codec: audioStream.codec_name || 'unknown'
      })
    })
  })
}

/**
 * 将音频/视频文件转换为 16kHz 单声道 WAV
 * 返回临时 WAV 文件路径
 */
export function convertToWav(inputPath: string): Promise<string> {
  const outputPath = join(tmpdir(), `irecord-${randomUUID()}.wav`)

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioFrequency(16000)
      .audioChannels(1)
      .audioCodec('pcm_s16le')
      .format('wav')
      .on('end', () => resolve(outputPath))
      .on('error', (err) => reject(new Error(`音频转换失败: ${err.message}`)))
      .save(outputPath)
  })
}

/**
 * 检查文件是否需要 FFmpeg 转换
 * 只有非 WAV 格式才需要转换，sherpa-onnx-node 内置重采样
 */
export async function needsConversion(filePath: string): Promise<boolean> {
  const ext = filePath.toLowerCase()
  // WAV 文件直接交给 sherpa-onnx-node 处理（内置重采样）
  if (ext.endsWith('.wav')) {
    return false
  }
  // 其他格式需要 FFmpeg 转换为 WAV
  return true
}
