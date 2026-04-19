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

export function invalidateSettingsCache(): void {
  settingsCache = null
}
