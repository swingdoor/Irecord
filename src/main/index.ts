import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { cleanupOldTempFiles, cleanupTempFiles } from './audio/temp'
import { registerIpcHandlers } from './ipc'
import { closeDb, resetStaleTasks } from './db/database'
import { shutdownQueue, startQueue } from './taskQueue'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
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
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
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

