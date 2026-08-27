import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'

export interface AsrParams {
  vadThreshold: number
  minSilenceDuration: number
  minSpeechDuration: number
  maxDurationSeconds: number
  vadMaxSpeechDuration: number
  speakerClusterThreshold: number
  diarizationDistanceThreshold: number
  sameSpeakerMergeGap: number
  minSampleLength: number
  qwen3MaxTotalLen: number
  qwen3MaxNewTokens: number
  cliNumThreads: number
  asrBatchSize: number
  senseVoiceLanguage: string
  minAsrSegmentDuration: number
  maxAsrSegmentDuration: number
}

export interface AppSettings {
  defaultModel?: string
  defaultStrategy?: string
  modelDir?: string
  ffmpegDir?: string
  llmProvider?: string
  llmModel?: string
  llmApiKey?: string
  llmApiKeys?: Record<string, string>
  llmCustomModels?: Record<string, string[]>
  themeMode?: 'default' | 'monochrome'
  debugAsrLog?: boolean
  asrParams?: Partial<AsrParams>
  mcpEnabled?: boolean
}

export const ASR_DEFAULTS: AsrParams = {
  vadThreshold: 0.5,
  minSilenceDuration: 1.5,
  minSpeechDuration: 1.0,
  maxDurationSeconds: 7200,
  vadMaxSpeechDuration: 60,
  speakerClusterThreshold: 0.5,
  diarizationDistanceThreshold: 1.2,
  sameSpeakerMergeGap: 2.0,
  minSampleLength: 1600,
  qwen3MaxTotalLen: 4096,
  qwen3MaxNewTokens: 1024,
  cliNumThreads: 4,
  asrBatchSize: 2,
  senseVoiceLanguage: 'zh',
  minAsrSegmentDuration: 0.8,
  maxAsrSegmentDuration: 60,
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

export function saveSettings(settings: Record<string, unknown>): AppSettings {
  writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), 'utf-8')
  settingsCache = settings as AppSettings
  return settingsCache
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  return saveSettings({ ...getSettings(), ...patch })
}

export function getAsrParams(): AsrParams {
  const settings = getSettings()
  return {
    ...ASR_DEFAULTS,
    ...(settings.asrParams || {}),
  }
}
