import { BrowserWindow, app } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { cpus } from 'os'
import { getNextPendingTask, hasProcessingTask, updateTask, saveResult, updateResultAnalysis } from './db/database'
import { getQwen3AsrModelPath, getSenseVoiceModelPath, getVadModelPath, getSegmentationModelPath, getEmbeddingModelPath } from './utils/paths'
import { convertToWav, needsConversion } from './audio/ffmpeg'
import { deleteTempFile } from './audio/temp'
import { callLLM } from './llm/client'
import { getSummaryPrompt, getSpeakersPrompt, getMinutesPrompt, getQaPrompt } from './llm/prompts'
import { getSettings, getAsrParams } from './utils/settings'

let currentProcess: ChildProcess | null = null
let currentTaskId: string | null = null
let taskStartTime: number = 0
let canceledFlag = false

export function startQueue(win: BrowserWindow) {
  processNext(win)
}

async function processNext(win: BrowserWindow) {
  if (await hasProcessingTask()) return

  const task = await getNextPendingTask()
  if (!task) return

  currentTaskId = task.id
  taskStartTime = Date.now()
  canceledFlag = false

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
      asrParams: getAsrParams(),
    })

    const result = await new Promise<any>((resolve, reject) => {
      // 打包后 node_modules 在 app.asar.unpacked 里，需要通过 NODE_PATH 和 cwd 让子进程找到
      const spawnEnv = { ...process.env }
      let spawnCwd: string | undefined
      if (app.isPackaged) {
        const unpackedModules = join(process.resourcesPath, 'app.asar.unpacked', 'node_modules')
        spawnEnv.NODE_PATH = unpackedModules
        spawnCwd = join(process.resourcesPath, 'app.asar.unpacked')
      }

      currentProcess = spawn('node', [scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: spawnEnv,
        cwd: spawnCwd,
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
        if (canceledFlag) return // 主动取消，不报错
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

    // 异步触发 AI 分析（不阻塞队列）
    triggerAiAnalysis(task.id, result.text, result.segments).catch(() => {})

    // 处理下一个
    processNext(win)
  } catch (err: any) {
    if (tempWavPath) { deleteTempFile(tempWavPath) }

    // Log full error for debugging
    console.error('Task processing error:', {
      taskId: task.id,
      filePath: task.filePath,
      error: err.message,
      stack: err.stack
    })

    // 主动取消时 cancelCurrentTask 已设置 stopped，不再覆盖为 failed
    if (!canceledFlag) {
      await updateTask(task.id, {
        status: 'failed',
        error: err.message,
        completedAt: new Date().toISOString(),
      })

      currentProcess = null
      currentTaskId = null
      notifyTaskChanged(win, task.id)
    }

    // 继续处理下一个
    processNext(win)
  }
}

function notifyTaskChanged(win: BrowserWindow, taskId: string) {
  if (!win.isDestroyed()) {
    win.webContents.send('task-status-changed', { taskId, startTime: taskStartTime })
  }
}

export async function cancelCurrentTask(win: BrowserWindow) {
  if (currentProcess) {
    canceledFlag = true
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

/**
 * 识别完成后异步触发 4 个 AI 分析，结果写入数据库
 */
async function triggerAiAnalysis(
  taskId: string,
  text: string,
  segments?: Array<{ text: string; start: number; end: number; speaker?: string }>
) {
  const settings = getSettings()

  if (!settings.llmApiKey) return // 未配置 API Key，跳过

  const analyses = [
    { field: 'aiSummary', prompt: getSummaryPrompt(text) },
    { field: 'aiSpeakers', prompt: getSpeakersPrompt(text, segments) },
    { field: 'aiMinutes', prompt: getMinutesPrompt(text) },
    { field: 'aiQa', prompt: getQaPrompt(text) },
  ]

  // 并行执行 4 个分析
  await Promise.allSettled(
    analyses.map(async ({ field, prompt }) => {
      try {
        const result = await callLLM(settings, prompt.system, prompt.user)
        await updateResultAnalysis(taskId, field, result)
      } catch (err: any) {
        console.error(`AI analysis [${field}] failed:`, err.message)
      }
    })
  )
}
