import { BrowserWindow } from 'electron'

export type AppDataChange = {
  resource: 'transcriptions' | 'knowledge-documents'
  action: 'created' | 'updated'
  id: string
}

export function notifyAppDataChanged(change: AppDataChange): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('app-data-changed', change)
  }
}
