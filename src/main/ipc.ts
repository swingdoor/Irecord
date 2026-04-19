import { app, ipcMain, dialog, BrowserWindow } from 'electron'
import { join } from 'path'
import { writeFile } from 'fs/promises'
import { statSync } from 'fs'
import { cpus } from 'os'
import { spawn, ChildProcess } from 'child_process'
import { getAudioInfo, convertToWav, needsConversion } from './audio/ffmpeg'
import { validateFile, getFileFilters } from './audio/validate'
import { deleteTempFile } from './audio/temp'
import { getQwen3AsrModelPath, checkModelExists, getVadModelPath, checkVadModelExists, getSegmentationModelPath, getEmbeddingModelPath, checkDiarizationModelsExist } from './utils/paths'

let tempWavPath: string | null = null
let processing = false
let asrProcess: ChildProcess | null = null

function buildFileInfo(filePath: string, info: any, isVideo: boolean) {
  return {
    filePath,
    fileName: filePath.split(/[\\/]/).pop() || '',
    duration: info.duration,
    format: info.format,
    sampleRate: info.sampleRate,
    channels: info.channels,
    isVideo,
    fileSize: statSync(filePath).size,
  }
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function registerIpcHandlers(): void {
  // 选择文件
  ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择音频/视频文件',
      filters: getFileFilters(),
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const filePath = result.filePaths[0]
    try {
      const validation = await validateFile(filePath)
      if (!validation.valid) return { error: validation.error }
      const info = await getAudioInfo(filePath)
      return buildFileInfo(filePath, info, validation.isVideo)
    } catch (err: any) {
      return { error: err.message }
    }
  })

  // 验证拖放的文件
  ipcMain.handle('validate-file', async (_event, filePath: string) => {
    try {
      const validation = await validateFile(filePath)
      if (!validation.valid) return { error: validation.error }
      const info = await getAudioInfo(filePath)
      return buildFileInfo(filePath, info, validation.isVideo)
    } catch (err: any) {
      return { error: err.message }
    }
  })

  // 检查模型是否存在
  ipcMain.handle('check-model', () => checkModelExists())

  // 开始处理
  ipcMain.handle('start-processing', async (event, filePath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { error: '窗口不存在' }
    if (!checkModelExists()) return { error: '模型文件缺失，请参考 resources/DOWNLOAD.md 下载模型' }
    if (processing) return { error: '正在处理中，请等待当前任务完成' }

    processing = true

    try {
      // 预处理：非 WAV 格式需要 FFmpeg 转换
      let wavPath = filePath
      if (await needsConversion(filePath)) {
        win.webContents.send('processing-progress', { stage: 'preprocessing' })
        wavPath = await convertToWav(filePath)
        tempWavPath = wavPath
      }

      win.webContents.send('processing-progress', { stage: 'recognizing' })

      // 统一使用 asr-process.js，根据可用模型自动选择策略
      const scriptName = 'asr-process.js'
      const asrScriptPath = app.isPackaged
        ? join(process.resourcesPath, scriptName)
        : join(__dirname, '../../src/main/engine', scriptName)

      const inputData = JSON.stringify({
        wavPath,
        modelDir: getQwen3AsrModelPath(),
        vadModelPath: getVadModelPath(),
        segmentationModelPath: getSegmentationModelPath(),
        embeddingModelPath: getEmbeddingModelPath(),
        numThreads: cpus().length,
      })

      // 在独立 Node.js 子进程中运行识别（避免 Electron external buffer 限制）
      const result = await new Promise<any>((resolve, reject) => {
        asrProcess = spawn('node', [asrScriptPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
        })

        let stdout = ''
        let stderr = ''

        asrProcess.stdout?.on('data', (chunk) => {
          stdout += chunk.toString()
          const lines = stdout.split('\n')
          stdout = lines.pop() || ''

          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const msg = JSON.parse(line)
              if (msg.type === 'result') {
                resolve({
                  text: msg.text,
                  segments: msg.segments,
                  speakerStats: msg.speakerStats,
                  keywords: msg.keywords,
                  lang: msg.lang,
                  strategy: msg.strategy,
                })
              } else if (msg.type === 'error') {
                reject(new Error(msg.message))
              }
            } catch {}
          }
        })

        asrProcess.stderr?.on('data', (chunk) => { stderr += chunk.toString() })
        asrProcess.on('close', (code) => {
          asrProcess = null
          if (code !== 0) reject(new Error(stderr || `子进程退出，代码: ${code}`))
        })
        asrProcess.on('error', (err) => { asrProcess = null; reject(err) })

        asrProcess.stdin?.write(inputData)
        asrProcess.stdin?.end()
      })

      if (tempWavPath) { deleteTempFile(tempWavPath); tempWavPath = null }
      win.webContents.send('processing-progress', { stage: 'done', percent: 100 })
      processing = false
      return result
    } catch (err: any) {
      if (tempWavPath) { deleteTempFile(tempWavPath); tempWavPath = null }
      processing = false
      return { error: err.message }
    }
  })

  // 取消处理
  ipcMain.handle('cancel-processing', () => {
    if (asrProcess) { asrProcess.kill(); asrProcess = null }
    if (tempWavPath) { deleteTempFile(tempWavPath); tempWavPath = null }
    processing = false
    return { success: true }
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

      // 关键词摘要
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
