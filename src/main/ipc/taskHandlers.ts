import { ipcMain, dialog, BrowserWindow } from 'electron'
import { existsSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { getFileFilters } from '../audio/validate'
import { getTask, getResult, deleteTask, updateTask } from '../db/database'
import { startQueue, cancelCurrentTask, getCurrentTaskId, getTaskStartTime } from '../taskQueue'
import { logError } from '../utils/errorHandler'
import { removeReference } from '../services/fileManager'
import { addFilesForIpc, getAllTranscriptionsForIpc, getTranscriptionResultForIpc } from '../services/applicationService'

function getMainWindow(): BrowserWindow | null {
  const wins = BrowserWindow.getAllWindows()
  return wins.length > 0 ? wins[0] : null
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function getUniqueFileName(dir: string, baseName: string, ext: string): string {
  // 清理文件名中的非法字符
  const cleanName = baseName.replace(/[<>:"/\\|?*]/g, '_')
  let fileName = `${cleanName}.${ext}`
  let counter = 1

  while (existsSync(join(dir, fileName))) {
    fileName = `${cleanName}(${counter}).${ext}`
    counter++
  }

  return fileName
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
    return addFilesForIpc(result.filePaths, modelType)
  })

  // 验证并添加拖放的文件
  ipcMain.handle('add-dropped-files', async (_event, filePaths: string[], modelType?: string) => {
    return addFilesForIpc(filePaths, modelType)
  })

  // 获取所有任务
  ipcMain.handle('get-tasks', async () => {
    return getAllTranscriptionsForIpc()
  })

  // 获取任务结果
  ipcMain.handle('get-task-result', async (_event, taskId: string) => {
    try {
      return await getTranscriptionResultForIpc(taskId)
    } catch (err: unknown) {
      logError('get-task-result', err)
      return { error: err instanceof Error ? err.message : '获取任务结果失败' }
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

      // 移除文件引用
      removeReference({ ownerId: taskId, ownerType: 'task' })

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

  // 批量导出任务 TXT
  ipcMain.handle('batch-export-task-txt', async (_event, taskIds: string[]) => {
    try {
      const result = await dialog.showOpenDialog({
        title: '选择导出文件夹',
        properties: ['openDirectory']
      })

      if (result.canceled || !result.filePaths[0]) return { canceled: true }

      const targetDir = result.filePaths[0]
      let success = 0
      let failed = 0
      const errors: Array<{ id: string; name: string; error: string }> = []

      for (const taskId of taskIds) {
        try {
          const task = await getTask(taskId)
          const taskResult = await getResult(taskId)

          // 只导出 completed 状态的任务
          if (task?.status !== 'completed' || !taskResult) {
            errors.push({ id: taskId, name: task?.fileName || taskId, error: '任务未完成' })
            failed++
            continue
          }

          // 生成内容
          let content = ''
          if (taskResult.segments) {
            const segments = JSON.parse(taskResult.segments)
            content = segments.map((s: any) => `${formatTimestamp(s.start)} - ${s.text}`).join('\n')
          } else {
            content = taskResult.text
          }

          // 导出
          const baseName = task.fileName.replace(/\.[^.]+$/, '')
          const fileName = getUniqueFileName(targetDir, baseName, 'txt')
          await writeFile(join(targetDir, fileName), content, 'utf-8')
          success++
        } catch (err: any) {
          errors.push({ id: taskId, name: '未知', error: err.message })
          failed++
        }
      }

      return { success, failed, errors, targetDir }
    } catch (err: any) {
      logError('batch-export-task-txt', err)
      return { error: err.message || '批量导出失败' }
    }
  })
}
