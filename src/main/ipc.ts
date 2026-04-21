import { app, ipcMain, dialog, BrowserWindow } from 'electron'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { writeFile, copyFile } from 'fs/promises'
import { statSync, existsSync, writeFileSync } from 'fs'
import { getAudioInfo } from './audio/ffmpeg'
import { validateFile, getFileFilters } from './audio/validate'
import { createTask, getAllTasks, getTask, getResult, deleteTask, updateTask, updateResultAnalysis, saveResult, createRealtimeRecording, getAllRealtimeRecordings, getRealtimeRecording, deleteRealtimeRecording } from './db/database'
import { startQueue, cancelCurrentTask, getCurrentTaskId, getTaskStartTime } from './taskQueue'
import { getAvailableModels, checkFfmpegExists, checkQwen3AsrModelExists, checkSenseVoiceModelExists } from './utils/paths'
import { getSettings, invalidateSettingsCache } from './utils/settings'
import { callLLM } from './llm/dashscope'
import { getSummaryPrompt, getSpeakersPrompt, getMinutesPrompt, getQaPrompt, getAskPrompt } from './llm/prompts'
import { IRealtimeRecognizer } from './engine/IRealtimeRecognizer'
import { RealtimeRecognizer, checkStreamingModelExists, getStreamingModelPath } from './engine/realtime-recognizer'
import { Qwen3RealtimeRecognizer } from './engine/qwen3-realtime-recognizer'
import { getQwen3AsrModelPath, getVadModelPath, checkQwen3AsrModelExists, checkVadModelExists } from './utils/paths'
import { getRealtimeEngineConfig } from './utils/settings'

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

  // 检查必要资源是否存在
  ipcMain.handle('check-resources', () => {
    return {
      ffmpegExists: checkFfmpegExists(),
      hasAnyModel: checkQwen3AsrModelExists() || checkSenseVoiceModelExists(),
    }
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

  // ===== 实时录音 =====
  let realtimeRecognizer: IRealtimeRecognizer | null = null

  ipcMain.handle('check-streaming-model', () => {
    const engineConfig = getRealtimeEngineConfig()
    if (engineConfig.engine === 'qwen3-simulated-streaming') {
      return { available: checkQwen3AsrModelExists() && checkVadModelExists() }
    }
    return { available: checkStreamingModelExists() }
  })

  ipcMain.handle('start-recording', async () => {
    try {
      if (realtimeRecognizer) {
        realtimeRecognizer.cleanup()
        realtimeRecognizer = null
      }

      const engineConfig = getRealtimeEngineConfig()
      console.log('[IPC] Starting recording with engine:', engineConfig.engine)

      if (engineConfig.engine === 'qwen3-simulated-streaming') {
        // Use Qwen3-ASR + Silero VAD
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
        // Use streaming zipformer (default fallback)
        const modelDir = getStreamingModelPath()
        realtimeRecognizer = new RealtimeRecognizer({ modelDir })
      }

      realtimeRecognizer.initialize()
      return { success: true }
    } catch (err: any) {
      console.error('[IPC] Failed to start recording:', err)
      return { error: err.message || '启动录音失败' }
    }
  })

  ipcMain.on('audio-chunk', (event, buffer: ArrayBuffer) => {
    if (!realtimeRecognizer) return

    try {
      // Create a proper Node.js-owned copy to avoid "External buffers are not allowed"
      const received = new Float32Array(buffer)
      const audioData = new Float32Array(received)
      const result = realtimeRecognizer.feedAudio(audioData)

      if (result && result.text && result.text.trim()) {
        if (result.isFinal) {
          console.log('[IPC] Sending segment-complete:', result.text, result.startTime, result.endTime)
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
      event.sender.send('recording-error', { message: err.message })
    }
  })

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

      console.log('[IPC] Recording stopped:', {
        filePath: result.filePath,
        segments: result.segments.length,
        duration,
        wordCount
      })

      return {
        text: fullText,
        segments: result.segments,
        filePath: result.filePath,
        duration,
        wordCount
      }
    } catch (err: any) {
      console.error('[IPC] Stop recording error:', err)
      realtimeRecognizer?.cleanup()
      realtimeRecognizer = null
      return { error: err.message || '停止录音失败' }
    }
  })

  // Deep analysis: pending_analysis → pending, trigger queue
  ipcMain.handle('start-deep-analysis', async (_event, taskId: string) => {
    try {
      await updateTask(taskId, { status: 'pending' })
      const win = getMainWindow()
      if (win) startQueue(win)
      return { success: true }
    } catch (err: any) {
      return { error: err.message || '启动分析失败' }
    }
  })

  // Export audio file
  ipcMain.handle('export-audio', async (_event, filePath: string) => {
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
      return { error: `导出失败: ${err.message}` }
    }
  })

  // ===== Realtime Recording IPC Handlers =====

  ipcMain.handle('get-realtime-recordings', async () => {
    try {
      const recordings = await getAllRealtimeRecordings()
      return JSON.parse(JSON.stringify(recordings))
    } catch (err: any) {
      return { error: err.message || '获取录音记录失败' }
    }
  })

  ipcMain.handle('get-realtime-recording', async (_event, id: string) => {
    try {
      const recording = await getRealtimeRecording(id)
      if (!recording) return { error: '录音记录不存在' }
      return { recording: JSON.parse(JSON.stringify(recording)) }
    } catch (err: any) {
      return { error: err.message || '获取录音记录失败' }
    }
  })

  ipcMain.handle('delete-realtime-recording', async (_event, id: string) => {
    try {
      const recording = await getRealtimeRecording(id)
      if (recording && recording.filePath && existsSync(recording.filePath)) {
        // Check if any task is using this file
        const tasks = await getAllTasks()
        const isFileInUse = tasks.some(t => t.filePath === recording.filePath && t.status !== 'completed' && t.status !== 'failed')

        if (!isFileInUse) {
          // Safe to delete file
          try {
            const { unlinkSync } = require('fs')
            unlinkSync(recording.filePath)
          } catch (err) {
            // Ignore file deletion errors
          }
        }
      }

      await deleteRealtimeRecording(id)
      return { success: true }
    } catch (err: any) {
      return { error: err.message || '删除录音记录失败' }
    }
  })

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
      return { error: `导出失败: ${err.message}` }
    }
  })

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

      await writeFile(result.filePath, content, 'utf-8')
      return { filePath: result.filePath }
    } catch (err: any) {
      return { error: `导出失败: ${err.message}` }
    }
  })

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
      return { error: err.message || '创建精准校对任务失败' }
    }
  })

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
      // Calculate actual file size
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
        // Wait a bit to ensure file is fully written and closed
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
      return { error: err.message || '保存录音记录失败' }
    }
  })
}
