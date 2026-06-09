import { app, BrowserWindow, Menu, protocol, net } from 'electron'
import { join } from 'path'
import { existsSync, statSync, readFileSync, createReadStream } from 'fs'
import { Readable } from 'stream'
import { cleanupOldTempFiles, cleanupTempFiles } from './audio/temp'
import { registerIpcHandlers } from './ipc/index'
import { closeDb, resetStaleTasks } from './db/database'
import { shutdownQueue, startQueue } from './taskQueue'
import { getResourcePath } from './utils/paths'
import { cleanupOrphanFiles } from './services/fileManager'

Menu.setApplicationMenu(null)

// Enable audio processing features in Chromium
app.commandLine.appendSwitch('enable-features', 'WebRtcAudioProcessing')

// 注册自定义协议，用于安全访问本地音视频文件
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { stream: true, bypassCSP: true } }
])

let mainWindow: BrowserWindow | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

function createWindow(): void {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'icon.ico')
    : join(__dirname, '../../icon.ico')

  mainWindow = new BrowserWindow({
    autoHideMenuBar: true,
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    title: '',
    icon: iconPath,
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#ffffff',
      symbolColor: '#333333',
      height: 30
    },
    backgroundColor: '#ffffff',
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
    try {
      const parsed = new URL(request.url)
      let filePath = decodeURIComponent(parsed.pathname)
      // Windows: /C:/Users/... -> C:/Users/...
      if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(filePath)) {
        filePath = filePath.substring(1)
      }

      if (!existsSync(filePath)) {
        return new Response('Not Found', { status: 404 })
      }

      const stat = statSync(filePath)
      const total = stat.size

      const ext = filePath.split('.').pop()?.toLowerCase() || ''
      const mimeMap: Record<string, string> = {
        wav: 'audio/wav', mp3: 'audio/mpeg', flac: 'audio/flac',
        aac: 'audio/aac', m4a: 'audio/mp4', ogg: 'audio/ogg',
        mp4: 'video/mp4', mkv: 'video/x-matroska', avi: 'video/x-msvideo', mov: 'video/quicktime',
      }
      const contentType = mimeMap[ext] || 'application/octet-stream'

      const rangeHeader = request.headers.get('Range')
      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/)
        if (match) {
          const start = parseInt(match[1], 10)
          const end = match[2] ? parseInt(match[2], 10) : total - 1
          const chunk = readFileSync(filePath).slice(start, end + 1)
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

      const buffer = readFileSync(filePath)
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(total),
          'Accept-Ranges': 'bytes',
        },
      })
    } catch (err: any) {
      return new Response(err.message || 'Internal Error', { status: 500 })
    }
  })

  cleanupOldTempFiles()
  await resetStaleTasks()
  registerIpcHandlers()
  createWindow()

  // 清理无引用的孤儿文件
  try {
    cleanupOrphanFiles()
  } catch {
    // 清理失败不影响启动
  }

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

