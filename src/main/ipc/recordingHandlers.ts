import { ipcMain, dialog, BrowserWindow } from 'electron'
import { existsSync, statSync, unlinkSync } from 'fs'
import { IRealtimeRecognizer } from '../engine/IRealtimeRecognizer'
import { RealtimeRecognizer, checkStreamingModelExists, getStreamingModelPath } from '../engine/realtime-recognizer'
import { Qwen3RealtimeRecognizer } from '../engine/qwen3-realtime-recognizer'
import { getQwen3AsrModelPath, getVadModelPath, checkQwen3AsrModelExists, checkVadModelExists } from '../utils/paths'
import { getRealtimeEngineConfig, getSettings } from '../utils/settings'
import { createRealtimeRecording, getAllRealtimeRecordings, getRealtimeRecording, deleteRealtimeRecording } from '../db/database'
import { createTask, getAllTasks } from '../db/database'
import { startQueue } from '../taskQueue'
import { logError } from '../utils/errorHandler'

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

let realtimeRecognizer: IRealtimeRecognizer | null = null

export function registerRecordingHandlers(): void {
  // 检查流式模型是否可用
  ipcMain.handle('check-streaming-model', () => {
    const engineConfig = getRealtimeEngineConfig()
    if (engineConfig.engine === 'qwen3-simulated-streaming') {
      return { available: checkQwen3AsrModelExists() && checkVadModelExists() }
    }
    return { available: checkStreamingModelExists() }
  })

  // 开始录音
  ipcMain.handle('start-recording', async () => {
    try {
      if (realtimeRecognizer) {
        realtimeRecognizer.cleanup()
        realtimeRecognizer = null
      }

      const engineConfig = getRealtimeEngineConfig()

      if (engineConfig.engine === 'qwen3-simulated-streaming') {
        const qwen3ModelDir = getQwen3AsrModelPath()
        const vadModelPath = getVadModelPath()

        if (!checkQwen3AsrModelExists()) {
          return { error: 'Qwen3-ASR 模型文件不存在，请在设置中配置模型路径' }
        }
        if (!checkVadModelExists()) {
          return { error: 'Silero VAD 模型文件不存在' }
        }

        realtimeRecognizer = new Qwen3RealtimeRecognizer({
          qwen3ModelDir,
          vadModelPath,
          params: engineConfig.qwen3Params,
          numThreads: 4
        })
      } else {
        const modelDir = getStreamingModelPath()
        realtimeRecognizer = new RealtimeRecognizer({ modelDir })
      }

      realtimeRecognizer.initialize()
      return { success: true }
    } catch (err: any) {
      logError('start-recording', err)
      realtimeRecognizer?.cleanup()
      realtimeRecognizer = null
      return { error: err.message || '启动录音失败' }
    }
  })

  // 接收音频块
  ipcMain.on('audio-chunk', (event, buffer: ArrayBuffer) => {
    if (!realtimeRecognizer) return

    try {
      const received = new Float32Array(buffer)
      const audioData = new Float32Array(received)
      const result = realtimeRecognizer.feedAudio(audioData)

      if (result && result.text && result.text.trim()) {
        if (result.isFinal) {
          event.sender.send('segment-complete', {
            text: result.text,
            startTime: result.startTime,
            endTime: result.endTime
          })
        } else {
          event.sender.send('realtime-result', {
            text: result.text,
            startTime: result.startTime
          })
        }
      }
    } catch (err: any) {
      logError('audio-chunk', err)
      event.sender.send('recording-error', { message: err.message })
    }
  })

  // 停止录音
  ipcMain.handle('stop-recording', async () => {
    if (!realtimeRecognizer) {
      return { error: '没有正在进行的录音' }
    }

    try {
      const result = realtimeRecognizer.finalize()
      realtimeRecognizer.cleanup()
      realtimeRecognizer = null

      const fullText = result.segments.map(s => s.text).join(' ')
      const duration = result.segments.length > 0
        ? result.segments[result.segments.length - 1].endTime
        : 0
      const wordCount = fullText.length

      return {
        text: fullText,
        segments: result.segments,
        filePath: result.filePath,
        duration,
        wordCount
      }
    } catch (err: any) {
      logError('stop-recording', err)
      realtimeRecognizer?.cleanup()
      realtimeRecognizer = null
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
      const recording = await getRealtimeRecording(id)
      if (recording && recording.filePath && existsSync(recording.filePath)) {
        const tasks = await getAllTasks()
        const isFileInUse = tasks.some(t =>
          t.filePath === recording.filePath &&
          t.status !== 'completed' &&
          t.status !== 'failed'
        )

        if (!isFileInUse) {
          try {
            unlinkSync(recording.filePath)
          } catch (err) {
            logError('delete-realtime-recording-file', err)
          }
        }
      }

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

  // 导出录音文本
  ipcMain.handle('export-realtime-recording-txt', async (_event, params: {
    text: string
    includeTimestamps: boolean
    segments?: Array<{ text: string; start: number; end: number }>
  }) => {
    try {
      const result = await dialog.showSaveDialog({
        title: '导出文本',
        defaultPath: `录音_${new Date().toLocaleString('zh-CN', { hour12: false }).replace(/[/:\\s]/g, '-')}.txt`,
        filters: [{ name: '文本文件', extensions: ['txt'] }]
      })

      if (result.canceled || !result.filePath) return { canceled: true }

      let content = ''
      if (params.includeTimestamps && params.segments) {
        content = params.segments.map(s => `${formatTimestamp(s.start)} - ${s.text}`).join('\n')
      } else {
        content = params.text
      }

      const { writeFile } = await import('fs/promises')
      await writeFile(result.filePath, content, 'utf-8')
      return { filePath: result.filePath }
    } catch (err: any) {
      logError('export-realtime-recording-txt', err)
      return { error: `导出失败: ${err.message}` }
    }
  })

  // 创建精准校对任务
  ipcMain.handle('create-proofreading-task', async (_event, recordingId: string) => {
    try {
      const recording = await getRealtimeRecording(recordingId)
      if (!recording) return { error: '录音记录不存在' }

      const settings = getSettings()
      const task = await createTask({
        fileName: recording.title,
        filePath: recording.filePath,
        fileSize: recording.fileSize,
        duration: recording.duration,
        modelType: settings.defaultModel || 'qwen3-asr',
        status: 'pending'
      })

      const win = getMainWindow()
      if (win) startQueue(win)

      return { taskId: task.id }
    } catch (err: any) {
      logError('create-proofreading-task', err)
      return { error: err.message || '创建精准校对任务失败' }
    }
  })

  // 保存录音记录
  ipcMain.handle('save-realtime-recording', async (_event, params: {
    title: string
    filePath: string
    fileSize: number
    duration: number
    wordCount: number
    text: string
    segments: Array<{ text: string; start: number; end: number }>
    createProofreadingTask: boolean
  }) => {
    try {
      const actualFileSize = existsSync(params.filePath) ? statSync(params.filePath).size : 0

      const recording = await createRealtimeRecording({
        title: params.title,
        filePath: params.filePath,
        fileSize: actualFileSize,
        duration: params.duration,
        wordCount: params.wordCount,
        text: params.text,
        segments: params.segments
      })

      let taskId: string | undefined

      if (params.createProofreadingTask) {
        await new Promise(resolve => setTimeout(resolve, 500))

        const settings = getSettings()
        const task = await createTask({
          fileName: params.title,
          filePath: params.filePath,
          fileSize: actualFileSize,
          duration: params.duration,
          modelType: settings.defaultModel || 'qwen3-asr',
          status: 'pending'
        })
        taskId = task.id

        const win = getMainWindow()
        if (win) startQueue(win)
      }

      return { recordingId: recording.id, taskId }
    } catch (err: any) {
      logError('save-realtime-recording', err)
      return { error: err.message || '保存录音记录失败' }
    }
  })

}
