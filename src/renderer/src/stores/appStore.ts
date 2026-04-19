import { create } from 'zustand'

export type AppPage = 'upload' | 'processing' | 'result'

export interface FileInfo {
  filePath: string
  fileName: string
  duration: number
  format: string
  sampleRate: number
  channels: number
  isVideo: boolean
  fileSize: number
}

export interface ProcessingState {
  stage: string
  percent: number
  startTime: number
  elapsedSeconds: number
}

export interface RecognitionResult {
  text: string
  segments?: Array<{ text: string; start: number; end: number; speaker?: string }>
  speakerStats?: Record<string, { segments: number; duration: number }>
  lang: string
  strategy?: 'speaker-diarization' | 'vad' | 'plain'
}

interface AppState {
  // 页面状态
  page: AppPage
  setPage: (page: AppPage) => void

  // 文件信息
  fileInfo: FileInfo | null
  setFileInfo: (info: FileInfo | null) => void

  // 处理状态
  processing: ProcessingState
  setProcessing: (state: Partial<ProcessingState>) => void
  resetProcessing: () => void

  // 识别结果
  result: RecognitionResult | null
  setResult: (result: RecognitionResult | null) => void

  // 错误信息
  error: string | null
  setError: (error: string | null) => void

  // 重置所有状态
  reset: () => void
}

const initialProcessing: ProcessingState = {
  stage: '',
  percent: 0,
  startTime: 0,
  elapsedSeconds: 0,
}

export const useAppStore = create<AppState>((set) => ({
  page: 'upload',
  setPage: (page) => set({ page }),

  fileInfo: null,
  setFileInfo: (fileInfo) => set({ fileInfo }),

  processing: initialProcessing,
  setProcessing: (state) =>
    set((prev) => ({ processing: { ...prev.processing, ...state } })),
  resetProcessing: () => set({ processing: initialProcessing }),

  result: null,
  setResult: (result) => set({ result }),

  error: null,
  setError: (error) => set({ error }),

  reset: () =>
    set({
      page: 'upload',
      fileInfo: null,
      processing: initialProcessing,
      result: null,
      error: null,
    }),
}))
