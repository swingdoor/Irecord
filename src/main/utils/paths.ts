import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'

/**
 * 获取资源文件路径
 * 开发模式：从项目根目录的 resources 读取
 * 打包模式：从 app.asar.unpacked/resources 读取
 */
export function getResourcePath(...paths: string[]): string {
  if (app.isPackaged) {
    // 打包后：resources 目录在 app.asar.unpacked 中
    return join(process.resourcesPath, 'resources', ...paths)
  } else {
    // 开发模式：resources 目录在项目根目录
    return join(__dirname, '../../resources', ...paths)
  }
}

/**
 * 获取模型目录路径
 */
export function getModelsPath(): string {
  return getResourcePath('models')
}

/**
 * 获取 Qwen3-ASR 模型路径
 */
export function getQwen3AsrModelPath(): string {
  const modelDir = join(getModelsPath(), 'sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25')
  return modelDir
}

/**
 * 检查模型文件是否存在
 */
export function checkModelExists(): boolean {
  const modelPath = getQwen3AsrModelPath()
  const encoderFile = join(modelPath, 'encoder.int8.onnx')
  const decoderFile = join(modelPath, 'decoder.int8.onnx')

  return existsSync(encoderFile) && existsSync(decoderFile)
}

/**
 * 获取 Silero VAD 模型路径
 */
export function getVadModelPath(): string {
  return getResourcePath('models', 'silero-vad', 'silero_vad.onnx')
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
  return getResourcePath('models', 'speaker-diarization')
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
 * 获取 FFmpeg 可执行文件路径
 */
export function getFfmpegPath(): string {
  return getResourcePath('ffmpeg', 'ffmpeg.exe')
}

/**
 * 获取 FFprobe 可执行文件路径
 */
export function getFfprobePath(): string {
  return getResourcePath('ffmpeg', 'ffprobe.exe')
}

/**
 * 检查 FFmpeg 是否存在
 */
export function checkFfmpegExists(): boolean {
  return existsSync(getFfmpegPath()) && existsSync(getFfprobePath())
}
