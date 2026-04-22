import { contextBridge, ipcRenderer } from 'electron'

const electronAPI = {
  // ===== 文件与模型 =====
  addFiles: (modelType?: string): Promise<{ tasks: any[]; errors: string[] }> =>
    ipcRenderer.invoke('add-files', modelType),
  addDroppedFiles: (filePaths: string[], modelType?: string): Promise<{ tasks: any[]; errors: string[] }> =>
    ipcRenderer.invoke('add-dropped-files', filePaths, modelType),
  getAvailableModels: (): Promise<Array<{ id: string; name: string; available: boolean; modelDir: string }>> =>
    ipcRenderer.invoke('get-available-models'),
  getFileUrl: (filePath: string): Promise<{ url?: string; error?: string }> =>
    ipcRenderer.invoke('get-file-url', filePath),
  readFileBuffer: (filePath: string): Promise<{ base64?: string; error?: string }> =>
    ipcRenderer.invoke('read-file-buffer', filePath),
  convertForPlayback: (filePath: string): Promise<{ url?: string; error?: string }> =>
    ipcRenderer.invoke('convert-for-playback', filePath),
  diagnoseAudio: (filePath: string): Promise<{ info?: any; error?: string }> =>
    ipcRenderer.invoke('diagnose-audio', filePath),
  selectFolder: (): Promise<{ path?: string; canceled?: boolean }> =>
    ipcRenderer.invoke('select-folder'),
  checkResources: (): Promise<{ ffmpegExists: boolean; hasAnyModel: boolean }> =>
    ipcRenderer.invoke('check-resources'),

  // ===== 任务管理 =====
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
  startDeepAnalysis: (taskId: string): Promise<{ success?: boolean; error?: string }> =>
    ipcRenderer.invoke('start-deep-analysis', taskId),
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

  // ===== 设置 =====
  getSettings: (): Promise<Record<string, any>> =>
    ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: Record<string, any>): Promise<{ success?: boolean; error?: string }> =>
    ipcRenderer.invoke('save-settings', settings),

  // ===== 导出 =====
  exportTxt: (options: {
    text: string
    includeTimestamps: boolean
    segments?: Array<{ text: string; start: number; end: number; speaker?: string }>
    keywords?: Array<{ word: string; score: number }>
  }): Promise<{ filePath?: string; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke('export-txt', options),
  exportAudio: (filePath: string): Promise<{ filePath?: string; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke('export-audio', filePath),

  // ===== LLM 分析 =====
  llmAnalyze: (params: {
    type: 'summary' | 'speakers' | 'minutes' | 'qa' | 'ask'
    text: string
    segments?: Array<{ text: string; start: number; end: number; speaker?: string }>
    question?: string
  }): Promise<{ result?: string; error?: string }> =>
    ipcRenderer.invoke('llm-analyze', params),
  updateAiAnalysis: (params: {
    taskId: string
    field: 'aiSummary' | 'aiSpeakers' | 'aiMinutes' | 'aiQa'
    value: string
  }): Promise<{ success?: boolean; error?: string }> =>
    ipcRenderer.invoke('update-ai-analysis', params),

  // ===== 实时录音控制 =====
  checkStreamingModel: (): Promise<{ available: boolean }> =>
    ipcRenderer.invoke('check-streaming-model'),
  startRecording: (): Promise<{ success?: boolean; error?: string }> =>
    ipcRenderer.invoke('start-recording'),
  sendAudioChunk: (buffer: ArrayBuffer): void => {
    ipcRenderer.send('audio-chunk', buffer)
  },
  stopRecording: (): Promise<{
    text?: string
    segments?: Array<{ text: string; startTime: number; endTime: number }>
    filePath?: string
    duration?: number
    wordCount?: number
    error?: string
  }> => ipcRenderer.invoke('stop-recording'),
  onRealtimeResult: (callback: (data: { text: string; startTime: number }) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('realtime-result', handler)
    return () => ipcRenderer.removeListener('realtime-result', handler)
  },
  onSegmentComplete: (callback: (data: { text: string; startTime: number; endTime: number }) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('segment-complete', handler)
    return () => ipcRenderer.removeListener('segment-complete', handler)
  },
  onRecordingError: (callback: (data: { message: string }) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('recording-error', handler)
    return () => ipcRenderer.removeListener('recording-error', handler)
  },

  // ===== 录音记录管理 =====
  getRealtimeRecordings: (): Promise<any[]> =>
    ipcRenderer.invoke('get-realtime-recordings'),
  getRealtimeRecording: (id: string): Promise<{ recording?: any; error?: string }> =>
    ipcRenderer.invoke('get-realtime-recording', id),
  deleteRealtimeRecording: (id: string): Promise<{ success?: boolean; error?: string }> =>
    ipcRenderer.invoke('delete-realtime-recording', id),
  exportRealtimeRecordingWav: (filePath: string): Promise<{ filePath?: string; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke('export-realtime-recording-wav', filePath),
  exportRealtimeRecordingTxt: (params: {
    text: string
    includeTimestamps: boolean
    segments?: Array<{ text: string; start: number; end: number }>
  }): Promise<{ filePath?: string; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke('export-realtime-recording-txt', params),
  createProofreadingTask: (recordingId: string): Promise<{ taskId?: string; error?: string }> =>
    ipcRenderer.invoke('create-proofreading-task', recordingId),
  saveRealtimeRecording: (params: {
    title: string
    filePath: string
    fileSize: number
    duration: number
    wordCount: number
    text: string
    segments: Array<{ text: string; start: number; end: number }>
    createProofreadingTask: boolean
  }): Promise<{ recordingId?: string; taskId?: string; error?: string }> =>
    ipcRenderer.invoke('save-realtime-recording', params),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
