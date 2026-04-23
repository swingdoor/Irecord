import { BrowserWindow, screen } from 'electron'
import { join } from 'path'

type RecordingMode = 'idle' | 'floating' | 'fullscreen' | 'saving'

let floatingRecorderWindow: BrowserWindow | null = null
let recordingState: RecordingMode = 'idle'

export function getRecordingState(): RecordingMode {
  return recordingState
}

export function setRecordingState(state: RecordingMode): void {
  recordingState = state
}

export function canStartRecording(mode: 'floating' | 'fullscreen'): boolean {
  return recordingState === 'idle'
}

export function createFloatingRecorderWindow(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.workArea

  floatingRecorderWindow = new BrowserWindow({
    width: 400,
    height: 140,
    x: width - 420,
    y: 20,
    frame: false,
    transparent: false,
    backgroundColor: '#ffffff',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    focusable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Load floating recorder page
  if (process.env.ELECTRON_RENDERER_URL) {
    floatingRecorderWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/floating-recorder`)
  } else {
    floatingRecorderWindow.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: 'floating-recorder'
    })
  }

  // Handle window close
  floatingRecorderWindow.on('close', (event) => {
    if (recordingState === 'floating' || recordingState === 'saving') {
      event.preventDefault()
      // Send event to renderer to show confirmation
      floatingRecorderWindow?.webContents.send('request-close-confirmation')
    }
  })

  floatingRecorderWindow.on('closed', () => {
    floatingRecorderWindow = null
    if (recordingState === 'floating' || recordingState === 'saving') {
      recordingState = 'idle'
    }
  })

  return floatingRecorderWindow
}

export function showFloatingRecorder(): BrowserWindow | null {
  if (!floatingRecorderWindow) {
    createFloatingRecorderWindow()
  }
  floatingRecorderWindow?.show()
  return floatingRecorderWindow
}

export function hideFloatingRecorder(): void {
  floatingRecorderWindow?.hide()
}

export function closeFloatingRecorder(): void {
  if (floatingRecorderWindow) {
    floatingRecorderWindow.destroy()
    floatingRecorderWindow = null
  }
  recordingState = 'idle'
}

export function getFloatingRecorderWindow(): BrowserWindow | null {
  return floatingRecorderWindow
}
