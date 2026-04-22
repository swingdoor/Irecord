import { ipcMain, dialog, BrowserWindow } from 'electron'
import { statSync } from 'fs'
import { getAudioInfo } from '../audio/ffmpeg'
import { validateFile, getFileFilters } from '../audio/validate'
import { createTask, getAllTasks, getTask, getResult, deleteTask, updateTask } from '../db/database'
import { startQueue, cancelCurrentTask, getCurrentTaskId, getTaskStartTime } from '../taskQueue'
import { logError } from '../utils/errorHandler'

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
      logError('addFilesCommon', err)
    }
  }

  const win = getMainWindow()
  if (win && tasks.length > 0) {
    startQueue(win)
  }

  return { tasks, errors }
}

export function registerTaskHandlers(): void {
  // 添加文件（支持多选）
  ipcMain.handle('add-files', async (_event, modelType?: string) => {
    const result = await dialog.showOpenDialog({
      title: '选择音频/视频文件',
      filters: getFileFilters(),
      properties: ['openFile', 'multiSelections']
    })

    if (result.canceled || result.filePaths.length === 0) return { tasks: [], errors: [] }
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

  // 获取任务结果
  ipcMain.handle('get-task-result', async (_event, taskId: string) => {
    try {
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
    } catch (err) {
      logError('get-task-result', err)
      return { error: '获取任务结果失败' }
    }
  })

  // 删除任务（如果正在处理则先取消）
  ipcMain.handle('delete-task', async (_event, taskId: string) => {
    try {
      const task = await getTask(taskId)
      if (task?.status === 'processing') {
        const win = getMainWindow()
        if (win) await cancelCurrentTask(win)
      }
      await deleteTask(taskId)
      return { success: true }
    } catch (err) {
      logError('delete-task', err)
      return { error: '删除任务失败' }
    }
  })

  // 取消任务（processing → stopped, pending → stopped）
  ipcMain.handle('cancel-task', async (_event, taskId: string) => {
    try {
      const task = await getTask(taskId)
      if (!task) return { error: '任务不存在' }

      if (task.status === 'processing') {
        const win = getMainWindow()
        if (win) await cancelCurrentTask(win)
      } else if (task.status === 'pending') {
        await updateTask(taskId, { status: 'stopped' })
      }
      return { success: true }
    } catch (err) {
      logError('cancel-task', err)
      return { error: '取消任务失败' }
    }
  })

  // 重新启动任务（stopped/failed → pending）
  ipcMain.handle('restart-task', async (_event, taskId: string) => {
    try {
      await updateTask(taskId, {
        status: 'pending',
        error: null,
        completedAt: null,
        processingTime: null,
        wordCount: null
      })
      const win = getMainWindow()
      if (win) startQueue(win)
      return { success: true }
    } catch (err) {
      logError('restart-task', err)
      return { error: '重启任务失败' }
    }
  })

  // 获取当前处理中的任务信息
  ipcMain.handle('get-current-task-info', () => {
    return {
      taskId: getCurrentTaskId(),
      startTime: getTaskStartTime(),
    }
  })

  // Deep analysis: pending_analysis → pending, trigger queue
  ipcMain.handle('start-deep-analysis', async (_event, taskId: string) => {
    try {
      await updateTask(taskId, { status: 'pending' })
      const win = getMainWindow()
      if (win) startQueue(win)
      return { success: true }
    } catch (err) {
      logError('start-deep-analysis', err)
      return { error: '启动分析失败' }
    }
  })
}
