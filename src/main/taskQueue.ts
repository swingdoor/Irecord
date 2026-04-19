import { BrowserWindow, app } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { cpus } from 'os'
import { getNextPendingTask, hasProcessingTask, updateTask, saveResult } from './db/database'
import { getQwen3AsrModelPath, getSenseVoiceModelPath, getVadModelPath, getSegmentationModelPath, getEmbeddingModelPath } from './utils/paths'
import { convertToWav, needsConversion } from './audio/ffmpeg'
import { deleteTempFile } from './audio/temp'

let currentProcess: ChildProcess | null = null
let currentTaskId: string | null = null
let taskStartTime: number = 0

export function startQueue(win: BrowserWindow) {
  processNext(win)
}

async function processNext(win: BrowserWindow) {
  if (await hasProcessingTask()) return

  const task = await getNextPendingTask()
  if (!task) return

  currentTaskId = task.id
  taskStartTime = Date.now()

  await updateTask(task.id, { status: 'processing', processingTime: null })
  notifyTaskChanged(win, task.id)

  let tempWavPath: string | null = null

  try {
    // 预处理
    let wavPath = task.filePath
    if (await needsConversion(task.filePath)) {
      wavPath = await convertToWav(task.filePath)
      tempWavPath = wavPath
    }

    // 启动子进程
    const scriptPath = app.isPackaged
      ? join(process.resourcesPath, 'asr-process.js')
      : join(__dirname, '../../src/main/engine/asr-process.js')

    // 根据 modelType 选择模型路径
    const modelDir = task.modelType === 'sensevoice-small'
      ? getSenseVoiceModelPath()
      : getQwen3AsrModelPath()

    const inputData = JSON.stringify({
      wavPath,
      modelDir,
      modelType: task.modelType || 'qwen3-asr',
      vadModelPath: getVadModelPath(),
      segmentationModelPath: getSegmentationModelPath(),
      embeddingModelPath: getEmbeddingModelPath(),
      numThreads: cpus().length,
    })

    const result = await new Promise<any>((resolve, reject) => {
      currentProcess = spawn('node', [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''

      currentProcess.stdout?.on('data', (chunk) => {
        stdout += chunk.toString()
        const lines = stdout.split('\n')
        stdout = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const msg = JSON.parse(line)
            if (msg.type === 'progress') {
              win.webContents.send('task-progress', { taskId: task.id, stage: msg.stage, percent: msg.percent })
            } else if (msg.type === 'result') {
              resolve(msg)
            } else if (msg.type === 'error') {
              reject(new Error(msg.message))
            }
          } catch {}
        }
      })

      currentProcess.stderr?.on('data', (chunk) => { stderr += chunk.toString() })
      currentProcess.on('close', (code) => {
        currentProcess = null
        if (code !== 0) reject(new Error(stderr || `子进程退出，代码: ${code}`))
      })
      currentProcess.on('error', (err) => { currentProcess = null; reject(err) })

      currentProcess.stdin?.write(inputData)
      currentProcess.stdin?.end()
    })

    // 清理临时文件
    if (tempWavPath) { deleteTempFile(tempWavPath); tempWavPath = null }

    // 保存结果
    const processingTime = (Date.now() - taskStartTime) / 1000
    const wordCount = (result.text || '').replace(/\s/g, '').length

    await updateTask(task.id, {
      status: 'completed',
      strategy: result.strategy,
      completedAt: new Date().toISOString(),
      processingTime,
      wordCount,
    })

    await saveResult(task.id, {
      text: result.text,
      segments: result.segments,
      speakerStats: result.speakerStats,
      keywords: result.keywords,
      lang: result.lang,
      strategy: result.strategy,
    })

    currentProcess = null
    currentTaskId = null
    notifyTaskChanged(win, task.id)

    // 处理下一个
    processNext(win)
  } catch (err: any) {
    if (tempWavPath) { deleteTempFile(tempWavPath) }

    await updateTask(task.id, {
      status: 'failed',
      error: err.message,
      completedAt: new Date().toISOString(),
    })

    currentProcess = null
    currentTaskId = null
    notifyTaskChanged(win, task.id)

    // 继续处理下一个
    processNext(win)
  }
}

function notifyTaskChanged(win: BrowserWindow, taskId: string) {
  win.webContents.send('task-status-changed', { taskId, startTime: taskStartTime })
}

export async function cancelCurrentTask(win: BrowserWindow) {
  if (currentProcess) {
    currentProcess.kill()
    currentProcess = null
  }
  if (currentTaskId) {
    await updateTask(currentTaskId, { status: 'stopped', completedAt: new Date().toISOString() })
    notifyTaskChanged(win, currentTaskId)
    currentTaskId = null
    // 事件驱动：取消后自动处理下一个
    processNext(win)
  }
}

export function getCurrentTaskId(): string | null {
  return currentTaskId
}

export function getTaskStartTime(): number {
  return taskStartTime
}

/**
 * 应用退出时调用：杀掉子进程，将 processing 任务重置为 pending
 */
export async function shutdownQueue() {
  if (currentProcess) {
    currentProcess.kill()
    currentProcess = null
  }
  if (currentTaskId) {
    await updateTask(currentTaskId, { status: 'pending' })
    currentTaskId = null
  }
}
