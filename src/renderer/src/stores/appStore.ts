import { create } from 'zustand'

export type AppPage = 'taskList' | 'taskDetail'

export interface Task {
  id: string
  fileName: string
  filePath: string
  fileSize: number
  duration: number
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'stopped'
  modelType: string
  strategy: string | null
  error: string | null
  createdAt: string
  completedAt: string | null
  processingTime: number | null
  wordCount: number | null
}

export interface TaskResultData {
  text: string
  segments?: Array<{ text: string; start: number; end: number; speaker?: string }>
  speakerStats?: Record<string, { segments: number; duration: number }>
  keywords?: Array<{ word: string; score: number }>
  lang: string
  strategy?: string
}

interface AppState {
  page: AppPage
  setPage: (page: AppPage) => void

  tasks: Task[]
  setTasks: (tasks: Task[]) => void
  refreshTasks: () => Promise<void>

  currentTaskId: string | null
  setCurrentTaskId: (id: string | null) => void

  currentResult: TaskResultData | null
  setCurrentResult: (result: TaskResultData | null) => void

  currentTask: Task | null
  setCurrentTask: (task: Task | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  page: 'taskList',
  setPage: (page) => set({ page }),

  tasks: [],
  setTasks: (tasks) => set({ tasks }),
  refreshTasks: async () => {
    const tasks = await window.electronAPI.getTasks()
    set({ tasks })
  },

  currentTaskId: null,
  setCurrentTaskId: (currentTaskId) => set({ currentTaskId }),

  currentResult: null,
  setCurrentResult: (currentResult) => set({ currentResult }),

  currentTask: null,
  setCurrentTask: (currentTask) => set({ currentTask }),
}))
