import { app, BrowserWindow, Menu, protocol, net } from 'electron'
import { join } from 'path'
import { existsSync, statSync, readFileSync } from 'fs'
import { Readable } from 'stream'
import { cleanupOldTempFiles, cleanupTempFiles } from './audio/temp'
import { registerIpcHandlers } from './ipc'
import { closeDb, resetStaleTasks } from './db/database'
import { shutdownQueue, startQueue } from './taskQueue'

Menu.setApplicationMenu(null)

// 注册自定义协议，用于安全访问本地音视频文件
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { stream: true, bypassCSP: true } }
])

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    autoHideMenuBar: true,
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    title: '语音转写助手',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    // 开发模式下自动打开 DevTools
    if (process.env.NODE_ENV === 'development' || process.env.ELECTRON_RENDERER_URL) {
      mainWindow?.webContents.openDevTools()
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  // 处理 local-file:// 协议请求（支持 Range 以实现音频 seek）
  protocol.handle('local-file', (request) => {
    const parsed = new URL(request.url)
    const filePath = decodeURIComponent(parsed.pathname).replace(/^\//, '')

    console.log('[local-file] Request:', request.url)
    console.log('[local-file] File path:', filePath)
    console.log('[local-file] Range header:', request.headers.get('Range'))

    if (!existsSync(filePath)) {
      console.error('[local-file] File not found:', filePath)
      return new Response('Not Found', { status: 404 })
    }

    const buffer = readFileSync(filePath)
    const total = buffer.length

    console.log('[local-file] File size:', total)

    // 根据扩展名推断 MIME
    const ext = filePath.split('.').pop()?.toLowerCase() || ''
    const mimeMap: Record<string, string> = {
      wav: 'audio/wav', mp3: 'audio/mpeg', flac: 'audio/flac',
      aac: 'audio/aac', m4a: 'audio/mp4', ogg: 'audio/ogg',
      mp4: 'video/mp4', mkv: 'video/x-matroska', avi: 'video/x-msvideo', mov: 'video/quicktime',
    }
    const contentType = mimeMap[ext] || 'application/octet-stream'

    console.log('[local-file] Content-Type:', contentType)

    const rangeHeader = request.headers.get('Range')
    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/)
      if (match) {
        const start = parseInt(match[1], 10)
        const end = match[2] ? parseInt(match[2], 10) : total - 1
        const chunk = buffer.slice(start, end + 1)
        console.log('[local-file] Range response:', start, '-', end, '/', total)
        return new Response(chunk, {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Content-Length': String(chunk.length),
            'Accept-Ranges': 'bytes',
          },
        })
      }
    }

    console.log('[local-file] Full response')
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(total),
        'Accept-Ranges': 'bytes',
      },
    })
  })

  cleanupOldTempFiles()
  await resetStaleTasks()
  registerIpcHandlers()
  createWindow()

  // 启动时自动处理残留的 pending 任务
  if (mainWindow) startQueue(mainWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', async () => {
  await shutdownQueue()
  cleanupTempFiles()
  closeDb()
})

