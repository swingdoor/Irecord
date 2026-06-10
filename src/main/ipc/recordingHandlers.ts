import { ipcMain, dialog, BrowserWindow } from 'electron'
import { existsSync, statSync } from 'fs'
import { copyFile } from 'fs/promises'
import { join } from 'path'
import { AudioRecorder } from '../audio/AudioRecorder'
import { getSettings } from '../utils/settings'
import { createRealtimeRecording, getAllRealtimeRecordings, getRealtimeRecording, deleteRealtimeRecording, getRecordingTranscriptionTask } from '../db/database'
import { createTask } from '../db/database'
import { startQueue } from '../taskQueue'
import { logError } from '../utils/errorHandler'
import { registerFile, addReference, removeReference } from '../services/fileManager'

function getMainWindow(): BrowserWindow | null {
  const wins = BrowserWindow.getAllWindows()
  // 找到主窗口（非浮动录音窗口），主窗口有 minWidth 设置
  for (const win of wins) {
    if (!win.isDestroyed()) {
      const [width] = win.getMinimumSize()
      if (width >= 1000) return win
    }
  }
  // fallback: 返回第一个未销毁的窗口
  for (const win of wins) {
    if (!win.isDestroyed()) return win
  }
  return null
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

let audioRecorder: AudioRecorder | null = null

export function registerRecordingHandlers(): void {
  // 开始录音
  ipcMain.handle('start-recording', async () => {
    try {
      // 已有录音进行中（audioRecorder 实例即单一事实来源）
      if (audioRecorder) {
        return { error: '已有录音正在进行中' }
      }

      audioRecorder = new AudioRecorder()
      audioRecorder.initialize()
      return { success: true }
    } catch (err: any) {
      logError('start-recording', err)
      audioRecorder?.cleanup()
      audioRecorder = null
      return { error: err.message || '启动录音失败' }
    }
  })

  // 接收音频块
  ipcMain.on('audio-chunk', (event, buffer: ArrayBuffer) => {
    if (!audioRecorder) return

    try {
      const received = new Float32Array(buffer)
      const audioData = new Float32Array(received)
      audioRecorder.feedAudio(audioData)
    } catch (err: any) {
      logError('audio-chunk', err)
      event.sender.send('recording-error', { message: err.message })
    }
  })

  // 停止录音：仅 finalize 原始 WAV，后处理由用户在配置阶段主动触发
  ipcMain.handle('stop-recording', async () => {
    if (!audioRecorder) {
      return { error: '没有正在进行的录音' }
    }

    try {
      const result = audioRecorder.finalize()
      audioRecorder.cleanup()
      audioRecorder = null

      return {
        filePath: result.filePath,
        duration: result.duration,
        fileSize: result.fileSize
      }
    } catch (err: any) {
      logError('stop-recording', err)
      audioRecorder?.cleanup()
      audioRecorder = null
      return { error: err.message || '停止录音失败' }
    }
  })

  // 获取所有录音记录
  ipcMain.handle('get-realtime-recordings', async () => {
    try {
      const recordings = await getAllRealtimeRecordings()
      return JSON.parse(JSON.stringify(recordings))
    } catch (err: any) {
      logError('get-realtime-recordings', err)
      return { error: err.message || '获取录音记录失败' }
    }
  })

  // 获取单个录音记录
  ipcMain.handle('get-realtime-recording', async (_event, id: string) => {
    try {
      const recording = await getRealtimeRecording(id)
      if (!recording) return { error: '录音记录不存在' }
      return { recording: JSON.parse(JSON.stringify(recording)) }
    } catch (err: any) {
      logError('get-realtime-recording', err)
      return { error: err.message || '获取录音记录失败' }
    }
  })

  // 删除录音记录
  ipcMain.handle('delete-realtime-recording', async (_event, id: string) => {
    try {
      // 移除文件引用
      removeReference({ ownerId: id, ownerType: 'recording' })

      await deleteRealtimeRecording(id)
      return { success: true }
    } catch (err: any) {
      logError('delete-realtime-recording', err)
      return { error: err.message || '删除录音记录失败' }
    }
  })

  // 导出录音 WAV 文件
  ipcMain.handle('export-realtime-recording-wav', async (_event, filePath: string) => {
    if (!existsSync(filePath)) return { error: '音频文件不存在' }

    const result = await dialog.showSaveDialog({
      title: '导出录音文件',
      defaultPath: filePath.split(/[\\/]/).pop() || 'recording.wav',
      filters: [{ name: '音频文件', extensions: ['wav'] }]
    })

    if (result.canceled || !result.filePath) return { canceled: true }

    try {
      await copyFile(filePath, result.filePath)
      return { filePath: result.filePath }
    } catch (err: any) {
      logError('export-realtime-recording-wav', err)
      return { error: `导出失败: ${err.message}` }
    }
  })

  // 为录音创建语音转写任务（统一流水线：source='recording'）
  ipcMain.handle('create-recording-transcription', async (_event, recordingId: string) => {
    try {
      const recording = await getRealtimeRecording(recordingId)
      if (!recording) return { error: '录音记录不存在' }

      // 后处理移除后录音文件唯一，转写直接用 filePath
      const transcriptionSource = recording.filePath
      if (!existsSync(transcriptionSource)) return { error: '录音文件不存在' }

      const settings = getSettings()
      const task = await createTask({
        fileName: recording.title,
        filePath: transcriptionSource,
        fileSize: recording.fileSize,
        duration: recording.duration,
        modelType: settings.defaultModel || 'qwen3-asr',
        status: 'pending',
        source: 'recording',
        sourceId: recording.id,
      })

      // 为任务添加文件引用（复用录音的文件，不复制）
      if (recording.fileId) {
        addReference({ fileId: recording.fileId, ownerId: task.id, ownerType: 'task' })
      } else {
        // 兼容旧数据：通过 filePath 注册
        registerFile({ filePath: transcriptionSource, ownerId: task.id, ownerType: 'task' })
      }

      const win = getMainWindow()
      if (win) startQueue(win)

      return { taskId: task.id }
    } catch (err: any) {
      logError('create-recording-transcription', err)
      return { error: err.message || '创建语音转写任务失败' }
    }
  })

  // 查询录音的转写状态（从关联 task 派生）
  ipcMain.handle('get-recording-transcription-status', async (_event, recordingId: string) => {
    try {
      const task = await getRecordingTranscriptionTask(recordingId)
      if (!task) return { status: 'none' as const }
      return { status: task.status, taskId: task.id }
    } catch (err: any) {
      logError('get-recording-transcription-status', err)
      return { status: 'none' as const, error: err.message }
    }
  })

  // 保存录音记录（纯音频；可选创建语音转写）
  ipcMain.handle('save-realtime-recording', async (_event, params: {
    title: string
    filePath: string
    fileSize: number
    duration: number
    createTranscription: boolean
  }) => {
    try {
      const actualFileSize = existsSync(params.filePath) ? statSync(params.filePath).size : 0

      const recording = await createRealtimeRecording({
        title: params.title,
        filePath: params.filePath,
        fileSize: actualFileSize,
        duration: params.duration,
      })

      // 注册文件到 FileManager
      const fileId = registerFile({
        filePath: params.filePath,
        ownerId: recording.id,
        ownerType: 'recording'
      })

      let taskId: string | undefined

      if (params.createTranscription) {
        const settings = getSettings()
        const task = await createTask({
          fileName: params.title,
          filePath: params.filePath,
          fileSize: actualFileSize,
          duration: params.duration,
          modelType: settings.defaultModel || 'qwen3-asr',
          status: 'pending',
          source: 'recording',
          sourceId: recording.id,
        })
        taskId = task.id

        // 复用录音文件引用
        addReference({ fileId, ownerId: task.id, ownerType: 'task' })

        const win = getMainWindow()
        if (win) startQueue(win)
      }

      return { recordingId: recording.id, taskId }
    } catch (err: any) {
      logError('save-realtime-recording', err)
      return { error: err.message || '保存录音记录失败' }
    }
  })

  // 批量导出录音音频
  ipcMain.handle('batch-export-recording-wav', async (_event, recordingIds: string[]) => {
    try {
      // 1. 选择目标文件夹
      const result = await dialog.showOpenDialog({
        title: '选择导出文件夹',
        properties: ['openDirectory']
      })

      if (result.canceled || !result.filePaths[0]) return { canceled: true }

      const targetDir = result.filePaths[0]
      let success = 0
      let failed = 0
      const errors: Array<{ id: string; name: string; error: string }> = []

      // 2. 循环导出
      for (const id of recordingIds) {
        try {
          const recording = await getRealtimeRecording(id)
          if (!recording || !existsSync(recording.filePath)) {
            errors.push({ id, name: recording?.title || id, error: '文件不存在' })
            failed++
            continue
          }

          // 3. 生成唯一文件名（处理重名）
          const fileName = getUniqueFileName(targetDir, recording.title, 'wav')
          await copyFile(recording.filePath, join(targetDir, fileName))
          success++
        } catch (err: any) {
          errors.push({ id, name: '未知', error: err.message })
          failed++
        }
      }

      return { success, failed, errors, targetDir }
    } catch (err: any) {
      logError('batch-export-recording-wav', err)
      return { error: err.message || '批量导出失败' }
    }
  })

}
