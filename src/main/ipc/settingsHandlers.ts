import { app, ipcMain } from 'electron'
import { join } from 'path'
import { writeFileSync } from 'fs'
import { getSettings, invalidateSettingsCache } from '../utils/settings'
import { getAvailableModels, checkFfmpegExists, checkQwen3AsrModelExists, checkSenseVoiceModelExists } from '../utils/paths'
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
}
