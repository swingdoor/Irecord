import { app, ipcMain, dialog, BrowserWindow } from 'electron'
import { join } from 'path'
import { writeFile } from 'fs/promises'
import { statSync } from 'fs'
import { getAudioInfo } from './audio/ffmpeg'
import { validateFile, getFileFilters } from './audio/validate'
import { createTask, getAllTasks, getTask, getResult, deleteTask, updateTask } from './db/database'
import { startQueue, cancelCurrentTask, getCurrentTaskId, getTaskStartTime } from './taskQueue'
import { getAvailableModels } from './utils/paths'

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

export function registerIpcHandlers(): void {
  // 添加文件（支持多选）
  ipcMain.handle('add-files', async (_event, modelType?: string) => {
    const result = await dialog.showOpenDialog({
      title: '选择音频/视频文件',
      filters: getFileFilters(),
      properties: ['openFile', 'multiSelections']
    })

    if (result.canceled || result.filePaths.length === 0) return { tasks: [] }

    const tasks = []
    const errors: string[] = []
    for (const filePath of result.filePaths) {
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
      } catch (err: any) {
        errors.push(`${filePath.split(/[\\/]/).pop()}: ${err.message}`)
      }
    }

    // 启动队列
    const win = getMainWindow()
    if (win && tasks.length > 0) {
      startQueue(win)
    }

    return { tasks, errors }
  })

  // 验证并添加拖放的文件
  ipcMain.handle('add-dropped-files', async (_event, filePaths: string[], modelType?: string) => {
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
      } catch (err: any) {
        errors.push(`${filePath.split(/[\\/]/).pop()}: ${err.message}`)
      }
    }

    const win = getMainWindow()
    if (win && tasks.length > 0) {
      startQueue(win)
    }

    return { tasks, errors }
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
}
