import { extname } from 'path'
import { getAudioInfo } from './ffmpeg'

const MAX_DURATION_SECONDS = 600 // 10 分钟

const SUPPORTED_AUDIO_EXTENSIONS = new Set([
  '.wav', '.mp3', '.flac', '.aac', '.m4a', '.ogg'
])

const SUPPORTED_VIDEO_EXTENSIONS = new Set([
  '.mp4', '.avi', '.mkv', '.mov', '.flv'
])

export interface FileValidation {
  valid: boolean
  error?: string
  isVideo: boolean
  duration: number
}

/**
 * 检查文件扩展名是否支持
 */
export function isSupportedFormat(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase()
  return SUPPORTED_AUDIO_EXTENSIONS.has(ext) || SUPPORTED_VIDEO_EXTENSIONS.has(ext)
}

/**
 * 检查文件是否为视频
 */
export function isVideoFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase()
  return SUPPORTED_VIDEO_EXTENSIONS.has(ext)
}

/**
 * 获取支持的文件过滤器（用于文件选择对话框）
 */
export function getFileFilters() {
  return [
    {
      name: '音频/视频文件',
      extensions: [
        ...Array.from(SUPPORTED_AUDIO_EXTENSIONS),
        ...Array.from(SUPPORTED_VIDEO_EXTENSIONS)
      ].map(ext => ext.slice(1)) // 去掉点号
    }
  ]
}

/**
 * 验证文件是否可以处理
 */
export async function validateFile(filePath: string): Promise<FileValidation> {
  // 检查格式
  if (!isSupportedFormat(filePath)) {
    return {
      valid: false,
      error: '不支持的文件格式',
      isVideo: false,
      duration: 0
    }
  }

  const isVideo = isVideoFile(filePath)

  // 获取音频信息
  try {
    const info = await getAudioInfo(filePath)

    // 检查时长
    if (info.duration > MAX_DURATION_SECONDS) {
      const minutes = Math.ceil(info.duration / 60)
      return {
        valid: false,
        error: `音频时长超过 10 分钟（当前 ${minutes} 分钟），请使用较短的音频文件`,
        isVideo,
        duration: info.duration
      }
    }

    return {
      valid: true,
      isVideo,
      duration: info.duration
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误'
    return {
      valid: false,
      error: message,
      isVideo,
      duration: 0
    }
  }
}
