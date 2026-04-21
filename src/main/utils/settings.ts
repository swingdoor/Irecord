import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'

export interface AsrParams {
  clusteringThreshold: number
  vadThreshold: number
  minSilenceDuration: number
  minSpeechDuration: number
  maxSegmentDuration: number
  maxDurationSeconds: number
  minDurationOn: number
  minDurationOff: number
  trimmedMinDuration: number
  sameSpeakerMergeGap: number
  displayMergeGap: number
  minSampleLength: number
  qwen3MaxTotalLen: number
  qwen3MaxNewTokens: number
}

export interface RealtimeRecordingParams {
  audioGain: number
  rule1MinTrailingSilence: number
  rule2MinTrailingSilence: number
  rule3MinUtteranceLength: number
}

export interface Qwen3RealtimeParams {
  audioGain: number
  vadThreshold: number
  vadMinSilenceDuration: number
  vadMaxSpeechDuration: number
  maxSegmentDuration: number
}

export type RealtimeEngine = 'streaming-zipformer' | 'qwen3-simulated-streaming'

export interface RealtimeEngineConfig {
  engine: RealtimeEngine
  zipformerParams: RealtimeRecordingParams
  qwen3Params: Qwen3RealtimeParams
}

export interface AppSettings {
  defaultModel?: string
  defaultStrategy?: string
  modelDir?: string
  ffmpegDir?: string
  llmProvider?: string
  llmModel?: string
  llmApiKey?: string
  themeMode?: 'default' | 'monochrome'
  asrParams?: Partial<AsrParams>
  realtimeParams?: Partial<RealtimeRecordingParams>
  realtimeEngineConfig?: Partial<RealtimeEngineConfig>
}

export const ASR_DEFAULTS: AsrParams = {
  clusteringThreshold: 0.85,
  vadThreshold: 0.5,
  minSilenceDuration: 1.5,
  minSpeechDuration: 1.0,
  maxSegmentDuration: 30.0,
  maxDurationSeconds: 7200,
  minDurationOn: 1.0,
  minDurationOff: 1.0,
  trimmedMinDuration: 0.5,
  sameSpeakerMergeGap: 2.0,
  displayMergeGap: 0.5,
  minSampleLength: 1600,
  qwen3MaxTotalLen: 4096,
  qwen3MaxNewTokens: 1024,
}

export const REALTIME_DEFAULTS: RealtimeRecordingParams = {
  audioGain: 1.0,
  rule1MinTrailingSilence: 2.4,
  rule2MinTrailingSilence: 1.2,
  rule3MinUtteranceLength: 20.0,
}

export const QWEN3_REALTIME_DEFAULTS: Qwen3RealtimeParams = {
  audioGain: 1.0,
  vadThreshold: 0.5,
  vadMinSilenceDuration: 0.5,
  vadMaxSpeechDuration: 30.0,
  maxSegmentDuration: 30.0,
}

export const REALTIME_ENGINE_DEFAULTS: RealtimeEngineConfig = {
  engine: 'qwen3-simulated-streaming',
  zipformerParams: REALTIME_DEFAULTS,
  qwen3Params: QWEN3_REALTIME_DEFAULTS,
}

let settingsCache: AppSettings | null = null

function getSettingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function getSettings(): AppSettings {
  if (settingsCache) return settingsCache

  try {
    const path = getSettingsPath()
    if (existsSync(path)) {
      settingsCache = JSON.parse(readFileSync(path, 'utf-8'))
      return settingsCache!
    }
  } catch (err) {
    console.error('Failed to load settings:', err)
  }

  settingsCache = {}
  return settingsCache
}

export function getAsrParams(): AsrParams {
  const settings = getSettings()
  return {
    ...ASR_DEFAULTS,
    ...(settings.asrParams || {}),
  }
}

export function getRealtimeParams(): RealtimeRecordingParams {
  const settings = getSettings()
  return {
    ...REALTIME_DEFAULTS,
    ...(settings.realtimeParams || {}),
  }
}

export function getRealtimeEngineConfig(): RealtimeEngineConfig {
  const settings = getSettings()
  const config = settings.realtimeEngineConfig || {}

  // Backward compatibility: if no engine specified, default to qwen3
  return {
    engine: config.engine || 'qwen3-simulated-streaming',
    zipformerParams: {
      ...REALTIME_DEFAULTS,
      ...(config.zipformerParams || settings.realtimeParams || {})
    },
    qwen3Params: {
      ...QWEN3_REALTIME_DEFAULTS,
      ...(config.qwen3Params || {})
    }
  }
}

export function invalidateSettingsCache(): void {
  settingsCache = null
}
