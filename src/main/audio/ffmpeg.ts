import { spawn, type ChildProcess } from 'child_process'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { getFfmpegPath } from '../utils/paths'
import { getTempDir, deleteTempFile } from './temp'
import { readWavInfo, type WavInfo } from './wav'

export interface AudioInfo {
  duration: number
  format: string
  sampleRate: number
  channels: number
  bitRate: number
  codec: string
}

export interface ConvertToWavOptions {
  onProcess?: (proc: ChildProcess | null) => void
  onStderr?: (text: string) => void
  outputPath?: string
  startSeconds?: number
  durationSeconds?: number
}

function createTempWavPath(prefix = 'irecord'): string {
  return join(getTempDir(), `${prefix}-${randomUUID()}.wav`)
}

function ffmpegErrorMessage(stderr: string, fallback: string): string {
  const lines = stderr.split('\n').map((line) => line.trim()).filter(Boolean)
  const tail = lines.slice(-6).join('\n')
  return tail ? `${fallback}: ${tail}` : fallback
}

/**
 * 将任意 ffmpeg 可解码输入统一转换为 16kHz mono pcm_s16le WAV。
 */
export function convertToWav(inputPath: string, options: ConvertToWavOptions = {}): Promise<string> {
  const outputPath = options.outputPath || createTempWavPath('irecord')
  const args: string[] = ['-y']

  if (typeof options.startSeconds === 'number') {
    args.push('-ss', String(Math.max(0, options.startSeconds)))
  }

  args.push('-i', inputPath, '-vn')

  if (typeof options.durationSeconds === 'number') {
    args.push('-t', String(Math.max(0.01, options.durationSeconds)))
  }

  args.push('-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-f', 'wav', outputPath)

  return new Promise((resolve, reject) => {
    const proc = spawn(getFfmpegPath(), args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    options.onProcess?.(proc)

    proc.stderr?.on('data', (chunk) => {
      const text = chunk.toString()
      stderr += text
      options.onStderr?.(text)
    })

    proc.on('error', (err) => {
      options.onProcess?.(null)
      deleteTempFile(outputPath)
      reject(new Error(`无法启动 FFmpeg: ${err.message}`))
    })

    proc.on('close', (code, signal) => {
      options.onProcess?.(null)
      if (code === 0) {
        try {
          readWavInfo(outputPath)
          resolve(outputPath)
        } catch (err) {
          deleteTempFile(outputPath)
          const message = err instanceof Error ? err.message : String(err)
          reject(new Error(`WAV 转换结果无效: ${message}`))
        }
        return
      }

      deleteTempFile(outputPath)
      if (signal) {
        reject(new Error(`FFmpeg 被信号 ${signal} 终止`))
        return
      }
      reject(new Error(ffmpegErrorMessage(stderr, `音频转换失败，退出码 ${code}`)))
    })
  })
}

/**
 * 通过固定 WAV 转换成功与否验证媒体，并从产物 WAV 头读取元数据。
 */
export async function getAudioInfo(filePath: string): Promise<AudioInfo> {
  let tempWavPath: string | null = null
  try {
    tempWavPath = await convertToWav(filePath)
    const info: WavInfo = readWavInfo(tempWavPath)
    return {
      duration: info.duration,
      format: info.format,
      sampleRate: info.sampleRate,
      channels: info.channels,
      bitRate: info.bitRate,
      codec: info.codec,
    }
  } finally {
    if (tempWavPath) deleteTempFile(tempWavPath)
  }
}

/**
 * CLI 路线要求所有输入都先标准化成固定 WAV。
 */
export async function needsConversion(_filePath: string): Promise<boolean> {
  return true
}

export function getWavInfo(filePath: string): WavInfo {
  return readWavInfo(filePath)
}
