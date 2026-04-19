import { app, ipcMain, dialog, BrowserWindow } from 'electron'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { writeFile } from 'fs/promises'
import { statSync, existsSync, writeFileSync } from 'fs'
import { getAudioInfo } from './audio/ffmpeg'
import { validateFile, getFileFilters } from './audio/validate'
import { createTask, getAllTasks, getTask, getResult, deleteTask, updateTask, updateResultAnalysis } from './db/database'
import { startQueue, cancelCurrentTask, getCurrentTaskId, getTaskStartTime } from './taskQueue'
import { getAvailableModels } from './utils/paths'
import { getSettings, invalidateSettingsCache } from './utils/settings'
import { callLLM } from './llm/dashscope'
import { getSummaryPrompt, getSpeakersPrompt, getMinutesPrompt, getQaPrompt, getAskPrompt } from './llm/prompts'

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function getMainWindow(): BrowserWindow | null {
  const wins = BrowserWindow.getAllWindows()
  return wins.length > 0 ? wins[0] : null
}

async function addFilesCommon(filePaths: string[], modelType?: string) {
  const tasks = []
  const errors: string[] = []
  for (const filePath of filePaths) {
    try {
      const validation = await validateFile(filePath)
      if (!validation.valid) {
        errors.push(`${filePath.split(/[\\/]/).pop()}: ${validation.error}`)
        continue
      }

      const info = await getAudioInfo(filePath)
      const task = await createTask({
        fileName: filePath.split(/[\\/]/).pop() || '',
        filePath,
        fileSize: statSync(filePath).size,
        duration: info.duration,
        modelType,
      })
      tasks.push(JSON.parse(JSON.stringify(task)))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '未知错误'
      errors.push(`${filePath.split(/[\\/]/).pop()}: ${message}`)
    }
  }

  const win = getMainWindow()
  if (win && tasks.length > 0) {
    startQueue(win)
  }

  return { tasks, errors }
}

export function registerIpcHandlers(): void {
  // 添加文件（支持多选）
  ipcMain.handle('add-files', async (_event, modelType?: string) => {
    const result = await dialog.showOpenDialog({
      title: '选择音频/视频文件',
      filters: getFileFilters(),
      properties: ['openFile', 'multiSelections']
    })

    if (result.canceled || result.filePaths.length === 0) return { tasks: [] }
    return addFilesCommon(result.filePaths, modelType)
  })

  // 验证并添加拖放的文件
  ipcMain.handle('add-dropped-files', async (_event, filePaths: string[], modelType?: string) => {
    return addFilesCommon(filePaths, modelType)
  })

  // 获取所有任务
  ipcMain.handle('get-tasks', async () => {
    const tasks = await getAllTasks()
    return JSON.parse(JSON.stringify(tasks))
  })

  // 获取可用模型列表
  ipcMain.handle('get-available-models', () => {
    return getAvailableModels()
  })

  // 获取任务结果
  ipcMain.handle('get-task-result', async (_event, taskId: string) => {
    const task = await getTask(taskId)
    if (!task) return { error: '任务不存在' }

    const result = await getResult(taskId)
    if (!result) return { error: '结果不存在' }

    return JSON.parse(JSON.stringify({
      task,
      result: {
        text: result.text,
        segments: result.segments ? JSON.parse(result.segments) : undefined,
        speakerStats: result.speakerStats ? JSON.parse(result.speakerStats) : undefined,
        keywords: result.keywords ? JSON.parse(result.keywords) : undefined,
        lang: result.lang,
        strategy: result.strategy,
        aiSummary: result.aiSummary || null,
        aiSpeakers: result.aiSpeakers || null,
        aiMinutes: result.aiMinutes || null,
        aiQa: result.aiQa || null,
      },
    }))
  })

  // 删除任务（如果正在处理则先取消）
  ipcMain.handle('delete-task', async (_event, taskId: string) => {
    const task = await getTask(taskId)
    if (task?.status === 'processing') {
      const win = getMainWindow()
      if (win) await cancelCurrentTask(win)
    }
    await deleteTask(taskId)
    return { success: true }
  })

  // 取消任务（processing → stopped, pending → stopped）
  ipcMain.handle('cancel-task', async (_event, taskId: string) => {
    const task = await getTask(taskId)
    if (!task) return { error: '任务不存在' }

    if (task.status === 'processing') {
      const win = getMainWindow()
      if (win) await cancelCurrentTask(win)
    } else if (task.status === 'pending') {
      await updateTask(taskId, { status: 'stopped' })
      // 不需要触发 processNext，pending 任务取消不影响队列
    }
    return { success: true }
  })

  // 重新启动任务（stopped/failed → pending）
  ipcMain.handle('restart-task', async (_event, taskId: string) => {
    await updateTask(taskId, { status: 'pending', error: null, completedAt: null, processingTime: null, wordCount: null })
    const win = getMainWindow()
    if (win) startQueue(win)
    return { success: true }
  })

  // 获取当前处理中的任务信息
  ipcMain.handle('get-current-task-info', () => {
    return {
      taskId: getCurrentTaskId(),
      startTime: getTaskStartTime(),
    }
  })

  // 导出 TXT 文件
  ipcMain.handle('export-txt', async (_event, options: {
    text: string
    includeTimestamps: boolean
    segments?: Array<{ text: string; start: number; end: number; speaker?: string }>
    keywords?: Array<{ word: string; score: number }>
  }) => {
    const result = await dialog.showSaveDialog({
      title: '导出转写结果',
      defaultPath: 'transcription.txt',
      filters: [{ name: '文本文件', extensions: ['txt'] }]
    })

    if (result.canceled || !result.filePath) return { canceled: true }

    try {
      let content = ''

      if (options.keywords?.length) {
        content += '关键词：' + options.keywords.map(k => k.word).join('、') + '\n\n'
      }

      if (options.includeTimestamps && options.segments?.length) {
        content += options.segments
          .map(seg => {
            const time = `[${formatTimestamp(seg.start)} - ${formatTimestamp(seg.end)}]`
            const speaker = seg.speaker ? ` ${seg.speaker}:` : ''
            return `${time}${speaker} ${seg.text}`
          })
          .join('\n')
      } else {
        content += options.text
      }

      await writeFile(result.filePath, content, 'utf-8')
      return { filePath: result.filePath }
    } catch (err: any) {
      return { error: `导出失败: ${err.message}` }
    }
  })

  // ===== 设置 =====
  const settingsPath = join(app.getPath('userData'), 'settings.json')

  ipcMain.handle('get-settings', () => {
    return getSettings()
  })

  ipcMain.handle('save-settings', (_event, settings: Record<string, any>) => {
    try {
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
      invalidateSettingsCache()
      return { success: true }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '保存失败'
      return { error: message }
    }
  })

  // 获取文件 URL（供渲染进程播放音频）
  ipcMain.handle('get-file-url', (_event, filePath: string) => {
    if (!existsSync(filePath)) return { error: '文件不存在' }
    return { url: `local-file:///${filePath.replace(/\\/g, '/')}` }
  })

  // 读取文件为 base64（供 wavesurfer 解码波形）
  ipcMain.handle('read-file-buffer', async (_event, filePath: string) => {
    if (!existsSync(filePath)) return { error: '文件不存在' }
    const { readFileSync } = await import('fs')
    const buffer = readFileSync(filePath)
    return { base64: buffer.toString('base64') }
  })

  // 转换文件为可播放格式（WAV，保留原始采样率和声道）
  ipcMain.handle('convert-for-playback', async (_event, filePath: string) => {
    try {
      if (!existsSync(filePath)) return { error: '文件不存在' }
      const outputPath = join(tmpdir(), `playback-${randomUUID()}.wav`)
      const ffmpegModule = await import('./audio/ffmpeg')
      await new Promise<void>((resolve, reject) => {
        const ff = require('fluent-ffmpeg')
        const { getFfmpegPath, getFfprobePath } = require('./utils/paths')
        ff.setFfmpegPath(getFfmpegPath())
        ff.setFfprobePath(getFfprobePath())
        ff(filePath)
          .audioCodec('pcm_s16le')
          .format('wav')
          .on('end', () => resolve())
          .on('error', (err: any) => reject(err))
          .save(outputPath)
      })
      const url = `local-file:///${outputPath.replace(/\\/g, '/')}`
      return { url }
    } catch (err: any) {
      return { error: err.message || '转换失败' }
    }
  })

  // 诊断音频文件信息
  ipcMain.handle('diagnose-audio', async (_event, filePath: string) => {
    try {
      const { getAudioInfo } = await import('./audio/ffmpeg')
      const info = await getAudioInfo(filePath)
      return { info }
    } catch (err: any) {
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

  // LLM 分析
  ipcMain.handle('llm-analyze', async (_event, params: {
    type: 'summary' | 'speakers' | 'minutes' | 'qa' | 'ask'
    text: string
    segments?: Array<{ text: string; start: number; end: number; speaker?: string }>
    question?: string
  }) => {
    try {
      const settings = getSettings()

      let prompt: { system: string; user: string }
      switch (params.type) {
        case 'summary': prompt = getSummaryPrompt(params.text); break
        case 'speakers': prompt = getSpeakersPrompt(params.text, params.segments); break
        case 'minutes': prompt = getMinutesPrompt(params.text); break
        case 'qa': prompt = getQaPrompt(params.text); break
        case 'ask':
          if (!params.question) return { error: '请输入问题' }
          prompt = getAskPrompt(params.text, params.question)
          break
        default: return { error: '未知分析类型' }
      }

      const result = await callLLM(settings, prompt.system, prompt.user)
      return { result }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '分析失败'
      return { error: message }
    }
  })

  // 更新 AI 分析结果到数据库
  ipcMain.handle('update-ai-analysis', async (_event, params: {
    taskId: string
    field: 'aiSummary' | 'aiSpeakers' | 'aiMinutes' | 'aiQa'
    value: string
  }) => {
    try {
      await updateResultAnalysis(params.taskId, params.field, params.value)
      return { success: true }
    } catch (err: any) {
      return { error: err.message || '更新失败' }
    }
  })
}
