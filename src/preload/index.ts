import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  addFiles: (modelType?: string): Promise<{ tasks: any[]; errors: string[] }> =>
    ipcRenderer.invoke('add-files', modelType),

  addDroppedFiles: (filePaths: string[], modelType?: string): Promise<{ tasks: any[]; errors: string[] }> =>
    ipcRenderer.invoke('add-dropped-files', filePaths, modelType),

  getAvailableModels: (): Promise<Array<{ id: string; name: string; available: boolean; modelDir: string }>> =>
    ipcRenderer.invoke('get-available-models'),

  getTasks: (): Promise<any[]> =>
    ipcRenderer.invoke('get-tasks'),

  getTaskResult: (taskId: string): Promise<any> =>
    ipcRenderer.invoke('get-task-result', taskId),

  deleteTask: (taskId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('delete-task', taskId),

  cancelTask: (taskId: string): Promise<{ success?: boolean; error?: string }> =>
    ipcRenderer.invoke('cancel-task', taskId),

  restartTask: (taskId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('restart-task', taskId),

  getCurrentTaskInfo: (): Promise<{ taskId: string | null; startTime: number }> =>
    ipcRenderer.invoke('get-current-task-info'),

  exportTxt: (options: {
    text: string
    includeTimestamps: boolean
    segments?: Array<{ text: string; start: number; end: number; speaker?: string }>
    keywords?: Array<{ word: string; score: number }>
  }): Promise<{ filePath?: string; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke('export-txt', options),

  onTaskStatusChanged: (callback: (data: { taskId: string; startTime?: number }) => void) => {
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
