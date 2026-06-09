import { app, ipcMain } from 'electron'
import { join } from 'path'
import { writeFileSync } from 'fs'
import { getSettings, invalidateSettingsCache } from '../utils/settings'
import { getAvailableModels, checkFfmpegExists, checkQwen3AsrModelExists, checkSenseVoiceModelExists, getUserModelsPath, getResourcePath } from '../utils/paths'
import { getProviderList } from '../llm/providers'
import { getFullRegistry, downloadModel, cancelDownload, deleteModel } from '../models/downloader'
import { getEngineAvailability, getOfflineModels, getAuxiliaryModels } from '../models/engines'
import { getModelStatus } from '../models/status'
import { logError } from '../utils/errorHandler'

export function registerSettingsHandlers(): void {
  const settingsPath = join(app.getPath('userData'), 'settings.json')

  // 获取设置
  ipcMain.handle('get-settings', () => {
    return getSettings()
  })

  // 保存设置
  ipcMain.handle('save-settings', (_event, settings: Record<string, any>) => {
    try {
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
      invalidateSettingsCache()
      return { success: true }
    } catch (err: unknown) {
      logError('save-settings', err)
      const message = err instanceof Error ? err.message : '保存失败'
      return { error: message }
    }
  })

  // 获取可用模型列表
  ipcMain.handle('get-available-models', () => {
    return getAvailableModels()
  })

  // 检查必要资源是否存在
  ipcMain.handle('check-resources', () => {
    return {
      ffmpegExists: checkFfmpegExists(),
      hasAnyModel: checkQwen3AsrModelExists() || checkSenseVoiceModelExists(),
    }
  })

  // 获取 LLM 厂商列表
  ipcMain.handle('get-llm-providers', () => {
    return getProviderList()
  })

  // 获取模型注册表（含实时状态 + 分组数据）
  ipcMain.handle('get-model-registry', () => {
    const fullModels = getFullRegistry()
    const offlineModels = getOfflineModels().map(m => ({ ...m, ...getModelStatus(m) }))
    const auxiliaryModels = getAuxiliaryModels().map(m => ({ ...m, ...getModelStatus(m) }))
    return {
      models: fullModels,
      offlineModels,
      auxiliaryModels,
      downloadPath: getUserModelsPath(),
      ffmpegExists: checkFfmpegExists(),
      defaultModelPath: getResourcePath('models'),
      defaultFfmpegPath: getResourcePath('ffmpeg'),
    }
  })

  // 获取引擎注册表
  ipcMain.handle('get-engine-registry', () => {
    return getEngineAvailability()
  })

  // 下载模型（不再 throw，通过 broadcastComplete 通知 UI）
  ipcMain.handle('download-model', async (_event, modelId: string) => {
    try {
      await downloadModel(modelId)
      return { success: true }
    } catch (err: any) {
      // Pre-download validation errors (not yet downloading)
      return { success: false, error: err.message }
    }
  })

  // 取消下载
  ipcMain.handle('cancel-model-download', (_event, modelId: string) => {
    return { success: cancelDownload(modelId) }
  })

  // 删除模型
  ipcMain.handle('delete-model', (_event, modelId: string) => {
    return deleteModel(modelId)
  })
}
