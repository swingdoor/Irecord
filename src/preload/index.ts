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
  getAudioBlob: (
    filePath: string
  ): Promise<{ buffer?: ArrayBuffer; mimeType?: string; error?: string }> =>
    ipcRenderer.invoke('get-audio-blob', filePath),
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
  getLlmProviders: (): Promise<Array<{ id: string; name: string; baseUrl: string; models: Array<{ id: string; name: string }> }>> =>
    ipcRenderer.invoke('get-llm-providers'),

  // ===== 模型管理 =====
  getModelRegistry: (): Promise<{ models: any[]; realtimeModels: any[]; offlineModels: any[]; auxiliaryModels: any[]; downloadPath: string; ffmpegExists: boolean; defaultModelPath: string; defaultFfmpegPath: string }> =>
    ipcRenderer.invoke('get-model-registry'),
  getEngineRegistry: (): Promise<Array<{ id: string; name: string; type: string; description: string; models: string[]; available: boolean }>> =>
    ipcRenderer.invoke('get-engine-registry'),
  downloadModel: (modelId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('download-model', modelId),
  cancelModelDownload: (modelId: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('cancel-model-download', modelId),
  deleteModel: (modelId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('delete-model', modelId),
  onModelDownloadProgress: (callback: (data: { modelId: string; percent: number; downloadedBytes: number; totalBytes: number }) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('model-download-progress', handler)
    return () => ipcRenderer.removeListener('model-download-progress', handler)
  },
  onModelDownloadComplete: (callback: (data: { modelId: string; success: boolean; error?: string }) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('model-download-complete', handler)
    return () => ipcRenderer.removeListener('model-download-complete', handler)
  },

  // ===== 导出 =====
  exportTxt: (options: {
    text: string
    includeTimestamps: boolean
    segments?: Array<{ text: string; start: number; end: number; speaker?: string }>
    keywords?: Array<{ word: string; score: number }>
    fileName?: string
    label?: string
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
    title?: string
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

  // ===== 浮动录音 =====
  startFloatingRecording: (): Promise<{ success?: boolean; error?: string }> =>
    ipcRenderer.invoke('start-floating-recording'),
  stopFloatingRecording: (): Promise<{
    text?: string
    segments?: Array<{ text: string; startTime: number; endTime: number }>
    filePath?: string
    duration?: number
    wordCount?: number
    error?: string
  }> => ipcRenderer.invoke('stop-floating-recording'),
  onShortcutStopRecording: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('shortcut-stop-recording', handler)
    return () => ipcRenderer.removeListener('shortcut-stop-recording', handler)
  },
  onRequestCloseConfirmation: (callback: () => void) => {
    const handler = () => callback()
    ipcRenderer.on('request-close-confirmation', handler)
    return () => ipcRenderer.removeListener('request-close-confirmation', handler)
  },
  closeFloatingRecorder: (): void => {
    ipcRenderer.send('close-floating-recorder')
  },

  // ===== 知识整理 =====
  createKnowledgeDoc: (params: {
    sourceIds: Array<{ type: 'task' | 'realtime'; id: string }>
    templateId: string
  }): Promise<{ docId?: string; error?: string }> =>
    ipcRenderer.invoke('create-knowledge-doc', params),
  getKnowledgeDocs: (): Promise<{ docs?: any[]; error?: string }> =>
    ipcRenderer.invoke('get-knowledge-docs'),
  getKnowledgeDoc: (docId: string): Promise<{ doc?: any; error?: string }> =>
    ipcRenderer.invoke('get-knowledge-doc', docId),
  updateKnowledgeDoc: (params: {
    docId: string
    title?: string
    content?: string
  }): Promise<{ success?: boolean; error?: string }> =>
    ipcRenderer.invoke('update-knowledge-doc', params),
  deleteKnowledgeDoc: (docId: string): Promise<{ success?: boolean; error?: string }> =>
    ipcRenderer.invoke('delete-knowledge-doc', docId),

  // ===== 模板管理 =====
  getTemplates: (): Promise<{ templates?: any[]; error?: string }> =>
    ipcRenderer.invoke('get-templates'),
  createTemplate: (params: { name: string; prompt: string }): Promise<{ template?: any; error?: string }> =>
    ipcRenderer.invoke('create-template', params),
  updateTemplate: (params: {
    templateId: string
    name?: string
    prompt?: string
  }): Promise<{ success?: boolean; error?: string }> =>
    ipcRenderer.invoke('update-template', params),
  deleteTemplate: (templateId: string): Promise<{ success?: boolean; error?: string }> =>
    ipcRenderer.invoke('delete-template', templateId),

  // ===== 润色 =====
  polishText: (params: {
    text: string
    type: 'polish' | 'rewrite' | 'expand'
  }): Promise<{ result?: string; error?: string }> =>
    ipcRenderer.invoke('polish-text', params),

  // ===== 知识文档导出 =====
  exportKnowledgeMarkdown: (params: { title: string; content: string }): Promise<{ filePath?: string; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke('export-knowledge-markdown', params),
  exportKnowledgeTxt: (params: { title: string; content: string }): Promise<{ filePath?: string; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke('export-knowledge-txt', params),
  exportKnowledgePdf: (params: { title: string; content: string }): Promise<{ filePath?: string; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke('export-knowledge-pdf', params),

  // ===== 批量操作 =====
  batchExportRecordingWav: (recordingIds: string[]): Promise<{
    success: number
    failed: number
    errors: Array<{ id: string; name: string; error: string }>
    targetDir?: string
    canceled?: boolean
    error?: string
  }> => ipcRenderer.invoke('batch-export-recording-wav', recordingIds),

  batchExportTaskTxt: (taskIds: string[]): Promise<{
    success: number
    failed: number
    errors: Array<{ id: string; name: string; error: string }>
    targetDir?: string
    canceled?: boolean
    error?: string
  }> => ipcRenderer.invoke('batch-export-task-txt', taskIds),

  batchExportKnowledge: (params: {
    docIds: string[]
    format: 'md' | 'txt' | 'pdf'
  }): Promise<{
    success: number
    failed: number
    errors: Array<{ id: string; name: string; error: string }>
    targetDir?: string
    canceled?: boolean
    error?: string
  }> => ipcRenderer.invoke('batch-export-knowledge', params),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
