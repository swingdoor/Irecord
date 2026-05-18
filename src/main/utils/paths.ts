import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { getSettings } from './settings'
import { MODEL_REGISTRY, type ModelEntry } from '../models/registry'

/**
 * 获取资源文件路径
 * 开发模式：从项目根目录的 resources 读取
 * 打包模式：从 app.asar.unpacked/resources 读取
 */
export function getResourcePath(...paths: string[]): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'resources', ...paths)
  } else {
    return join(__dirname, '../../resources', ...paths)
  }
}

/**
 * 获取用户数据目录下的模型路径
 */
export function getUserModelsPath(): string {
  return join(app.getPath('userData'), 'models')
}

/**
 * 分层查找模型目录
 * 查找顺序：自定义 modelDir → userData/models/ → resourcesPath/resources/models/
 * 返回 { path, location } 或 null
 */
export function findModelDir(folderName: string): { path: string; location: 'custom' | 'user' | 'bundled' } | null {
  const settings = getSettings()

  // 1. 自定义 modelDir
  if (settings.modelDir) {
    const customPath = join(settings.modelDir, folderName)
    if (existsSync(customPath)) return { path: customPath, location: 'custom' }
  }

  // 2. userData/models/
  const userPath = join(getUserModelsPath(), folderName)
  if (existsSync(userPath)) return { path: userPath, location: 'user' }

  // 3. resourcesPath/resources/models/
  const bundledPath = getResourcePath('models', folderName)
  if (existsSync(bundledPath)) return { path: bundledPath, location: 'bundled' }

  return null
}

/**
 * 获取模型目录路径（兼容旧 API，优先使用 findModelDir）
 */
export function getModelsPath(): string {
  const settings = getSettings()
  if (settings.modelDir && existsSync(settings.modelDir)) {
    return settings.modelDir
  }
  return getResourcePath('models')
}

/**
 * 获取 ffmpeg 路径（优先用户配置，fallback 内置路径）
 */
export function getFfmpegPath(): string {
  const settings = getSettings()
  if (settings.ffmpegDir && existsSync(join(settings.ffmpegDir, 'ffmpeg.exe'))) {
    return join(settings.ffmpegDir, 'ffmpeg.exe')
  }
  return getResourcePath('ffmpeg', 'ffmpeg.exe')
}

/**
 * 获取 ffprobe 路径（优先用户配置，fallback 内置路径）
 */
export function getFfprobePath(): string {
  const settings = getSettings()
  if (settings.ffmpegDir && existsSync(join(settings.ffmpegDir, 'ffprobe.exe'))) {
    return join(settings.ffmpegDir, 'ffprobe.exe')
  }
  return getResourcePath('ffmpeg', 'ffprobe.exe')
}

/**
 * 获取 Qwen3-ASR 模型路径
 */
export function getQwen3AsrModelPath(): string {
  const found = findModelDir('sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25')
  return found?.path ?? join(getModelsPath(), 'sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25')
}

/**
 * 获取 SenseVoice Small 模型路径
 */
export function getSenseVoiceModelPath(): string {
  const found = findModelDir('sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17')
  return found?.path ?? join(getModelsPath(), 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17')
}

/**
 * 检查 Qwen3-ASR 模型文件是否存在
 */
export function checkQwen3AsrModelExists(): boolean {
  const modelPath = getQwen3AsrModelPath()
  const encoderFile = join(modelPath, 'encoder.int8.onnx')
  const decoderFile = join(modelPath, 'decoder.int8.onnx')
  return existsSync(encoderFile) && existsSync(decoderFile)
}

/**
 * 检查 SenseVoice 模型文件是否存在
 */
export function checkSenseVoiceModelExists(): boolean {
  const modelPath = getSenseVoiceModelPath()
  const modelFile = join(modelPath, 'model.int8.onnx')
  const tokensFile = join(modelPath, 'tokens.txt')
  return existsSync(modelFile) && existsSync(tokensFile)
}

/**
 * 检查模型文件是否存在（兼容旧代码）
 */
export function checkModelExists(): boolean {
  return checkQwen3AsrModelExists()
}

/**
 * 获取 Silero VAD 模型路径
 */
export function getVadModelPath(): string {
  const found = findModelDir('silero-vad')
  return found ? join(found.path, 'silero_vad.onnx') : join(getModelsPath(), 'silero-vad', 'silero_vad.onnx')
}

/**
 * 检查 VAD 模型是否存在
 */
export function checkVadModelExists(): boolean {
  return existsSync(getVadModelPath())
}

/**
 * 获取说话人分离模型目录路径
 */
export function getDiarizationModelPath(): string {
  const found = findModelDir('speaker-diarization')
  return found?.path ?? join(getModelsPath(), 'speaker-diarization')
}

/**
 * 获取说话人分割模型路径
 */
export function getSegmentationModelPath(): string {
  return join(getDiarizationModelPath(), 'pyannote_segmentation.onnx')
}

/**
 * 获取说话人嵌入模型路径
 */
export function getEmbeddingModelPath(): string {
  return join(getDiarizationModelPath(), '3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx')
}

/**
 * 检查说话人分离模型是否完整
 */
export function checkDiarizationModelsExist(): boolean {
  return existsSync(getSegmentationModelPath()) && existsSync(getEmbeddingModelPath())
}

/**
 * 检查 FFmpeg 是否存在
 */
export function checkFfmpegExists(): boolean {
  return existsSync(getFfmpegPath()) && existsSync(getFfprobePath())
}

export interface ModelInfo {
  id: string
  name: string
  available: boolean
  modelDir: string
}

/**
 * 获取流式识别模型路径
 */
export function getStreamingZipformerModelPath(): string {
  const found = findModelDir('sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30')
  return found?.path ?? join(getModelsPath(), 'sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30')
}

/**
 * 检查流式识别模型是否存在
 */
export function checkStreamingZipformerModelExists(): boolean {
  const modelDir = getStreamingZipformerModelPath()
  const encoder = join(modelDir, 'encoder.int8.onnx')
  const decoder = join(modelDir, 'decoder.onnx')
  const joiner = join(modelDir, 'joiner.int8.onnx')
  const tokens = join(modelDir, 'tokens.txt')
  return existsSync(encoder) && existsSync(decoder) && existsSync(joiner) && existsSync(tokens)
}

/**
 * 获取所有支持的模型及其可用状态
 */
export function getAvailableModels(): ModelInfo[] {
  return [
    {
      id: 'qwen3-asr',
      name: 'Qwen3-ASR 0.6B（高精度）',
      available: checkQwen3AsrModelExists(),
      modelDir: getQwen3AsrModelPath(),
    },
    {
      id: 'sensevoice-small',
      name: 'SenseVoice Small（轻量快速）',
      available: checkSenseVoiceModelExists(),
      modelDir: getSenseVoiceModelPath(),
    },
    {
      id: 'streaming-zipformer-zh',
      name: 'Streaming Zipformer（实时录音）',
      available: checkStreamingZipformerModelExists(),
      modelDir: getStreamingZipformerModelPath(),
    },
  ]
}
