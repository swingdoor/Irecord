import { create } from 'zustand'

export type AppPage = 'taskList' | 'taskDetail' | 'recording' | 'realtimeRecordingDetail' | 'knowledgeDetail'

export interface Task {
  id: string
  fileName: string
  filePath: string
  fileSize: number
  duration: number
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'stopped' | 'pending_analysis' | 'recording'
  modelType: string
  strategy: string | null
  error: string | null
  createdAt: string
  completedAt: string | null
  processingTime: number | null
  wordCount: number | null
}

export interface RealtimeRecording {
  id: string
  title: string
  filePath: string
  fileSize: number
  duration: number
  wordCount: number
  modelType: string | null
  createdAt: string
  text: string
  segments: string
}

export interface KnowledgeDoc {
  id: string
  title: string
  content: string
  status: 'generating' | 'completed' | 'failed'
  templateId: string
  sourceIds: string
  error: string | null
  createdAt: string
  updatedAt: string
}

export interface KnowledgeTemplate {
  id: string
  name: string
  prompt: string
  builtin: number
  createdAt: string
  updatedAt: string
}

export interface TaskResultData {
  text: string
  segments?: Array<{ text: string; start: number; end: number; speaker?: string }>
  speakerStats?: Record<string, { segments: number; duration: number }>
  keywords?: Array<{ word: string; score: number }>
  lang: string
  strategy?: string
  aiSummary?: string | null
  aiSpeakers?: string | null
  aiMinutes?: string | null
  aiQa?: string | null
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

  realtimeRecordings: RealtimeRecording[]
  setRealtimeRecordings: (recordings: RealtimeRecording[]) => void
  refreshRealtimeRecordings: () => Promise<void>

  currentRealtimeRecordingId: string | null
  setCurrentRealtimeRecordingId: (id: string | null) => void

  currentRealtimeRecording: RealtimeRecording | null
  setCurrentRealtimeRecording: (recording: RealtimeRecording | null) => void

  knowledgeDocs: KnowledgeDoc[]
  setKnowledgeDocs: (docs: KnowledgeDoc[]) => void
  refreshKnowledgeDocs: () => Promise<void>

  currentKnowledgeDocId: string | null
  setCurrentKnowledgeDocId: (id: string | null) => void

  currentKnowledgeDoc: KnowledgeDoc | null
  setCurrentKnowledgeDoc: (doc: KnowledgeDoc | null) => void

  templates: KnowledgeTemplate[]
  setTemplates: (templates: KnowledgeTemplate[]) => void
  refreshTemplates: () => Promise<void>

  activeTab: string
  setActiveTab: (tab: string) => void
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

  realtimeRecordings: [],
  setRealtimeRecordings: (realtimeRecordings) => set({ realtimeRecordings }),
  refreshRealtimeRecordings: async () => {
    const recordings = await window.electronAPI.getRealtimeRecordings()
    set({ realtimeRecordings: recordings })
  },

  currentRealtimeRecordingId: null,
  setCurrentRealtimeRecordingId: (currentRealtimeRecordingId) => set({ currentRealtimeRecordingId }),

  currentRealtimeRecording: null,
  setCurrentRealtimeRecording: (currentRealtimeRecording) => set({ currentRealtimeRecording }),

  knowledgeDocs: [],
  setKnowledgeDocs: (knowledgeDocs) => set({ knowledgeDocs }),
  refreshKnowledgeDocs: async () => {
    const res = await window.electronAPI.getKnowledgeDocs()
    if (res.docs) set({ knowledgeDocs: res.docs })
  },

  currentKnowledgeDocId: null,
  setCurrentKnowledgeDocId: (currentKnowledgeDocId) => set({ currentKnowledgeDocId }),

  currentKnowledgeDoc: null,
  setCurrentKnowledgeDoc: (currentKnowledgeDoc) => set({ currentKnowledgeDoc }),

  templates: [],
  setTemplates: (templates) => set({ templates }),
  refreshTemplates: async () => {
    const res = await window.electronAPI.getTemplates()
    if (res.templates) set({ templates: res.templates })
  },

  activeTab: 'realtime',
  setActiveTab: (activeTab) => set({ activeTab }),
}))
