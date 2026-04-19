import { contextBridge, ipcRenderer } from 'electron'

export interface FileInfo {
  filePath: string
  fileName: string
  duration: number
  format: string
  sampleRate: number
  channels: number
  isVideo: boolean
  fileSize: number
  error?: string
}

export interface ProcessingProgress {
  stage: string
  percent: number
}

export interface RecognitionResult {
  text: string
  segments?: Array<{ text: string; start: number; end: number; speaker?: string }>
  speakerStats?: Record<string, { segments: number; duration: number }>
  keywords?: Array<{ word: string; score: number }>
  lang: string
  strategy?: 'speaker-diarization' | 'vad' | 'plain'
  error?: string
}

const electronAPI = {
  selectFile: (): Promise<FileInfo | null> =>
    ipcRenderer.invoke('select-file'),

  validateFile: (filePath: string): Promise<FileInfo> =>
    ipcRenderer.invoke('validate-file', filePath),

  checkModel: (): Promise<boolean> =>
    ipcRenderer.invoke('check-model'),

  startProcessing: (filePath: string): Promise<RecognitionResult> =>
    ipcRenderer.invoke('start-processing', filePath),

  cancelProcessing: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('cancel-processing'),

  exportTxt: (options: {
    text: string
    includeTimestamps: boolean
    segments?: Array<{ text: string; start: number; end: number; speaker?: string }>
    keywords?: Array<{ word: string; score: number }>
  }): Promise<{ filePath?: string; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke('export-txt', options),

  onProcessingProgress: (callback: (progress: ProcessingProgress) => void) => {
    const handler = (_event: any, progress: ProcessingProgress) => callback(progress)
    ipcRenderer.on('processing-progress', handler)
    return () => ipcRenderer.removeListener('processing-progress', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
