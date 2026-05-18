import { join } from 'path'
import { createWriteStream, existsSync, mkdirSync, rmSync, statfsSync } from 'fs'
import { pipeline } from 'stream/promises'
import { createGunzip } from 'zlib'
import https from 'https'
import http from 'http'
import { app, BrowserWindow } from 'electron'
import tar from 'tar'
import unbzip2 from 'unbzip2-stream'
import { MODEL_REGISTRY, getModelEntry, type ModelEntry } from './registry'
import { getModelStatus, markDownloading, unmarkDownloading, getDownloadTargetPath } from './status'
import { getUserModelsPath } from '../utils/paths'

const activeControllers = new Map<string, AbortController>()

const MAX_RETRIES = 3
const RETRY_DELAYS = [2000, 4000, 8000] // exponential backoff

function getTmpDir(): string {
  return join(getUserModelsPath(), '.tmp')
}

function broadcastProgress(modelId: string, percent: number, downloadedBytes: number, totalBytes: number): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('model-download-progress', { modelId, percent, downloadedBytes, totalBytes })
  }
}

function broadcastComplete(modelId: string, success: boolean, error?: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('model-download-complete', { modelId, success, error })
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function followRedirects(url: string, signal: AbortSignal, extraHeaders?: Record<string, string>): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('Download cancelled'))

    const handler = (res: http.IncomingMessage) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        followRedirects(res.headers.location, signal, extraHeaders).then(resolve, reject)
        return
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      resolve(res)
    }

    const parsedUrl = new URL(url)
    const options: http.RequestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      headers: extraHeaders || {},
    }

    const mod = url.startsWith('https') ? https : http
    const req = mod.get(options, handler)
    req.on('error', reject)

    signal.addEventListener('abort', () => {
      req.destroy()
      reject(new Error('Download cancelled'))
    })
  })
}

async function downloadWithRetry(url: string, archivePath: string, modelId: string, totalSizeHint: number, controller: AbortController): Promise<void> {
  let lastError: Error | null = null
  let downloadedBytes = 0

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (controller.signal.aborted) throw new Error('Download cancelled')

    if (attempt > 0) {
      const delay = RETRY_DELAYS[attempt - 1] || 8000
      broadcastProgress(modelId, -1, downloadedBytes, totalSizeHint) // -1 percent signals "retrying"
      await sleep(delay)
      if (controller.signal.aborted) throw new Error('Download cancelled')
    }

    try {
      // Use Range header to resume from where we left off
      const headers: Record<string, string> = {}
      if (downloadedBytes > 0) {
        headers['Range'] = `bytes=${downloadedBytes}-`
      }

      const res = await followRedirects(url, controller.signal, headers)

      // If server responds 206 (Partial Content), we're resuming
      // If server responds 200, it doesn't support Range — restart from 0
      if (res.statusCode === 200 && downloadedBytes > 0) {
        downloadedBytes = 0 // server doesn't support resume, restart
      }

      const contentLength = parseInt(res.headers['content-length'] || '0', 10)
      const totalBytes = res.statusCode === 206
        ? downloadedBytes + contentLength
        : contentLength || totalSizeHint

      const fileStream = createWriteStream(archivePath, {
        flags: downloadedBytes > 0 && res.statusCode === 206 ? 'a' : 'w'
      })

      await new Promise<void>((resolve, reject) => {
        res.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length
          const percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0
          broadcastProgress(modelId, percent, downloadedBytes, totalBytes)
        })
        res.on('error', reject)
        res.pipe(fileStream)
        fileStream.on('finish', resolve)
        fileStream.on('error', reject)

        controller.signal.addEventListener('abort', () => {
          res.destroy()
          fileStream.close()
          reject(new Error('Download cancelled'))
        })
      })

      return // success
    } catch (err: any) {
      lastError = err
      if (err.message === 'Download cancelled') throw err
      // Network error — retry if attempts remain
    }
  }

  throw lastError || new Error('下载失败')
}

export async function downloadModel(modelId: string): Promise<void> {
  const entry = getModelEntry(modelId)
  if (!entry) throw new Error(`Unknown model: ${modelId}`)
  if (!entry.downloadUrl) throw new Error(`Model ${modelId} has no download URL`)

  const status = getModelStatus(entry)
  if (status.status === 'installed') throw new Error(`Model ${modelId} is already installed`)
  if (status.status === 'downloading') throw new Error(`Model ${modelId} is already downloading`)

  // Disk space check (need 2x model size for download + extract)
  const targetDir = getUserModelsPath()
  if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true })
  try {
    const stats = statfsSync(targetDir)
    const availableBytes = stats.bavail * stats.bsize
    const requiredBytes = entry.size * 2
    if (availableBytes < requiredBytes) {
      const availMB = Math.round(availableBytes / 1024 / 1024)
      const reqMB = Math.round(requiredBytes / 1024 / 1024)
      throw new Error(`磁盘空间不足：需要 ${reqMB} MB，可用 ${availMB} MB`)
    }
  } catch (err: any) {
    if (err.message?.includes('磁盘空间不足')) throw err
  }

  const controller = new AbortController()
  activeControllers.set(modelId, controller)
  markDownloading(modelId)

  const tmpDir = join(getTmpDir(), modelId)
  if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true })

  const archivePath = join(tmpDir, 'model.tar.bz2')

  try {
    // Download with retry
    await downloadWithRetry(entry.downloadUrl, archivePath, modelId, entry.size, controller)

    // Extract .tar.bz2
    const extractDir = getUserModelsPath()
    await pipeline(
      require('fs').createReadStream(archivePath),
      unbzip2(),
      tar.extract({ cwd: extractDir })
    )

    // Verify required files
    const modelDir = getDownloadTargetPath(entry)
    const missingFiles = entry.requiredFiles.filter((f) => !existsSync(join(modelDir, f)))
    if (missingFiles.length > 0) {
      throw new Error(`模型文件校验失败，缺少：${missingFiles.join(', ')}`)
    }

    broadcastComplete(modelId, true)
  } catch (err: any) {
    // Clean up on failure
    const modelDir = getDownloadTargetPath(entry)
    if (existsSync(modelDir)) rmSync(modelDir, { recursive: true, force: true })
    broadcastComplete(modelId, false, err.message === 'Download cancelled' ? undefined : err.message)
  } finally {
    // Clean up tmp
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true })
    activeControllers.delete(modelId)
    unmarkDownloading(modelId)
  }
}

export function cancelDownload(modelId: string): boolean {
  const controller = activeControllers.get(modelId)
  if (controller) {
    controller.abort()
    return true
  }
  return false
}

export function deleteModel(modelId: string): { success: boolean; error?: string } {
  const entry = getModelEntry(modelId)
  if (!entry) return { success: false, error: `Unknown model: ${modelId}` }

  const status = getModelStatus(entry)
  if (status.status !== 'installed') return { success: false, error: '模型未安装' }
  if (!status.deletable) return { success: false, error: '内置模型不可删除' }

  try {
    if (status.path) {
      rmSync(status.path, { recursive: true, force: true })
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export function getFullRegistry(): Array<ModelEntry & { status: string; location?: string; deletable: boolean }> {
  return MODEL_REGISTRY.map((entry) => {
    const st = getModelStatus(entry)
    return { ...entry, status: st.status, location: st.location, deletable: st.deletable }
  })
}
