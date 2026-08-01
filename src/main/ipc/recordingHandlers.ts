import { ipcMain, dialog } from 'electron'
import { existsSync, statSync, renameSync } from 'fs'
import { copyFile } from 'fs/promises'
import { dirname, extname, join } from 'path'
import { AudioRecorder } from '../audio/AudioRecorder'
import { createRealtimeRecording, getAllRealtimeRecordings, getRealtimeRecording, deleteRealtimeRecording } from '../db/database'
import { logError } from '../utils/errorHandler'
import { registerFile, removeReference } from '../services/fileManager'

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

  // 保存录音记录（仅保存音频；转写统一走文件转写入口）
  ipcMain.handle('save-realtime-recording', async (_event, params: {
    title: string
    filePath: string
    fileSize: number
    duration: number
  }) => {
    try {
      const ext = extname(params.filePath) || '.wav'
      const fileName = getUniqueFileName(dirname(params.filePath), params.title, ext.slice(1))
      const filePath = join(dirname(params.filePath), fileName)
      if (filePath !== params.filePath) renameSync(params.filePath, filePath)
      const actualFileSize = statSync(filePath).size

      const recording = await createRealtimeRecording({
        title: fileName,
        filePath,
        fileSize: actualFileSize,
        duration: params.duration,
      })

      // 注册文件到 FileManager
      registerFile({
        filePath,
        ownerId: recording.id,
        ownerType: 'recording'
      })
      return { recordingId: recording.id, filePath }
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
