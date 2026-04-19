import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  addFiles: (): Promise<{ tasks: any[] }> =>
    ipcRenderer.invoke('add-files'),

  addDroppedFiles: (filePaths: string[]): Promise<{ tasks: any[] }> =>
    ipcRenderer.invoke('add-dropped-files', filePaths),

  getTasks: (): Promise<any[]> =>
    ipcRenderer.invoke('get-tasks'),

  getTaskResult: (taskId: string): Promise<any> =>
    ipcRenderer.invoke('get-task-result', taskId),

  deleteTask: (taskId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('delete-task', taskId),

  cancelCurrentTask: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('cancel-current-task'),

  getCurrentTaskInfo: (): Promise<{ taskId: string | null; startTime: number }> =>
    ipcRenderer.invoke('get-current-task-info'),

  exportTxt: (options: {
    text: string
    includeTimestamps: boolean
    segments?: Array<{ text: string; start: number; end: number; speaker?: string }>
    keywords?: Array<{ word: string; score: number }>
  }): Promise<{ filePath?: string; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke('export-txt', options),

  onTaskStatusChanged: (callback: (data: { taskId: string }) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('task-status-changed', handler)
    return () => ipcRenderer.removeListener('task-status-changed', handler)
  },

  onTaskProgress: (callback: (data: { taskId: string; stage: string; percent: number }) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('task-progress', handler)
    return () => ipcRenderer.removeListener('task-progress', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
