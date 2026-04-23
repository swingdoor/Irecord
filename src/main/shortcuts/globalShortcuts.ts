import { globalShortcut, BrowserWindow } from 'electron'
import {
  canStartRecording,
  getRecordingState,
  showFloatingRecorder,
  getFloatingRecorderWindow
} from '../windows/floatingRecorder'

let isRegistered = false

export function registerRecordingShortcut(mainWindow: BrowserWindow): { success: boolean; error?: string } {
  try {
    const shortcut = 'CommandOrControl+Shift+R'

    const success = globalShortcut.register(shortcut, () => {
      handleShortcutPressed(mainWindow)
    })

    if (!success) {
      return {
        success: false,
        error: `快捷键 ${shortcut} 注册失败，可能已被其他应用占用`
      }
    }

    isRegistered = true
    return { success: true }
  } catch (err: any) {
    return {
      success: false,
      error: err.message || '快捷键注册失败'
    }
  }
}

function handleShortcutPressed(mainWindow: BrowserWindow): void {
  const state = getRecordingState()

  // Ignore if in save dialog mode
  if (state === 'saving') {
    return
  }

  // Ignore if fullscreen recording is active
  if (state === 'fullscreen') {
    return
  }

  // If idle, start floating recording
  if (state === 'idle') {
    if (canStartRecording('floating')) {
      showFloatingRecorder()
    }
    return
  }

  // If floating recording is active, stop it
  if (state === 'floating') {
    const floatingWindow = getFloatingRecorderWindow()
    if (floatingWindow) {
      floatingWindow.webContents.send('shortcut-stop-recording')
    }
  }
}

export function unregisterRecordingShortcut(): void {
  if (isRegistered) {
    globalShortcut.unregisterAll()
    isRegistered = false
  }
}
