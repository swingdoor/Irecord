import { ipcMain, dialog } from 'electron'
import { existsSync } from 'fs'
import { copyFile } from 'fs/promises'
import { getAudioInfo, convertToWav } from '../audio/ffmpeg'
import { logError } from '../utils/errorHandler'

export function registerFileHandlers(): void {
  // 获取文件 URL（用于播放）
  ipcMain.handle('get-file-url', async (_event, filePath: string) => {
    try {
      if (!existsSync(filePath)) return { error: '文件不存在' }
      return { url: `local-file://${filePath}` }
    } catch (err: any) {
      logError('get-file-url', err)
      return { error: err.message }
    }
  })

  // 读取文件为 base64
  ipcMain.handle('read-file-buffer', async (_event, filePath: string) => {
    try {
      const { readFile } = await import('fs/promises')
      const buffer = await readFile(filePath)
      return { base64: buffer.toString('base64') }
    } catch (err: any) {
      logError('read-file-buffer', err)
      return { error: err.message }
    }
  })

  // 转换音频用于播放
  ipcMain.handle('convert-for-playback', async (_event, filePath: string) => {
    try {
      if (!existsSync(filePath)) return { error: '文件不存在' }

      const ext = filePath.split('.').pop()?.toLowerCase()
      if (ext === 'wav' || ext === 'mp3' || ext === 'ogg') {
        return { url: `local-file://${filePath}` }
      }

      const tmpPath = await convertToWav(filePath)
      return { url: `local-file://${tmpPath}` }
    } catch (err: any) {
      logError('convert-for-playback', err)
      return { error: err.message }
    }
  })

  // 诊断音频文件
  ipcMain.handle('diagnose-audio', async (_event, filePath: string) => {
    try {
      const info = await getAudioInfo(filePath)
      return { info }
    } catch (err: any) {
      logError('diagnose-audio', err)
      return { error: err.message }
    }
  })

  // 选择文件夹
  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (result.canceled) return { canceled: true }
    return { path: result.filePaths[0] }
  })

  // 导出音频文件
  ipcMain.handle('export-audio', async (_event, filePath: string) => {
    try {
      if (!existsSync(filePath)) return { error: '源文件不存在' }

      const ext = filePath.split('.').pop() || 'wav'
      const fileName = filePath.split(/[\\/]/).pop() || `audio.${ext}`

      const result = await dialog.showSaveDialog({
        title: '导出音频',
        defaultPath: fileName,
        filters: [{ name: '音频文件', extensions: [ext] }]
      })

      if (result.canceled || !result.filePath) return { canceled: true }

      await copyFile(filePath, result.filePath)
      return { filePath: result.filePath }
    } catch (err: any) {
      logError('export-audio', err)
      return { error: err.message }
    }
  })
}
