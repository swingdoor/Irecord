import { existsSync, statSync } from 'node:fs'
import { basename, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import { getAudioInfo } from '../audio/ffmpeg'
import { validateFile } from '../audio/validate'
import {
  createKnowledgeDoc,
  createTask,
  getAllKnowledgeDocs,
  getAllRealtimeRecordings,
  getAllTasks,
  getAllTemplates,
  getKnowledgeDoc,
  getRealtimeRecording,
  getResult,
  getTask,
  getTemplate,
  updateKnowledgeDoc,
  type KnowledgeDoc,
  type KnowledgeTemplate,
  type RealtimeRecording,
  type Task,
} from '../db/database'
import { callLLM } from '../llm/client'
import { getKnowledgeDocPrompt } from '../llm/prompts'
import { registerFile } from './fileManager'
import { startQueue } from '../taskQueue'
import { getSettings } from '../utils/settings'
import { getAvailableModels } from '../utils/paths'
import { logError } from '../utils/errorHandler'
import { DomainError } from './domainError'
import { chunkText, paginate } from './pagination'
import { notifyAppDataChanged } from './appDataEvents'

export interface ListOptions {
  query?: string
  created_after?: string
  created_before?: string
  cursor?: string
  limit?: number
}

export interface RecordingSummary {
  id: string
  title: string
  duration: number
  size: number
  created_at: string
  transcription_available: boolean
}

export interface TranscriptionSummary {
  task_id: string
  file_name: string
  status: Task['status']
  duration: number
  word_count: number | null
  model: string
  created_at: string
  completed_at: string | null
  error?: string
}

export interface TemplateSummary {
  id: string
  name: string
  prompt: string
  builtin: boolean
  updated_at: string
}

export interface DocumentSummary {
  document_id: string
  title: string
  status: KnowledgeDoc['status']
  template_id: string
  source_transcription_ids: string[]
  error?: string
  created_at: string
  updated_at: string
}

function matchesText(values: Array<string | null | undefined>, query?: string): boolean {
  if (!query?.trim()) return true
  const needle = query.trim().toLocaleLowerCase()
  return values.some(value => value?.toLocaleLowerCase().includes(needle))
}

function matchesDates(value: string, after?: string, before?: string): boolean {
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return false
  if (after) {
    const afterTime = Date.parse(after)
    if (!Number.isFinite(afterTime)) throw new DomainError('INVALID_ARGUMENT', 'created_after 必须是有效的日期时间')
    if (time < afterTime) return false
  }
  if (before) {
    const beforeTime = Date.parse(before)
    if (!Number.isFinite(beforeTime)) throw new DomainError('INVALID_ARGUMENT', 'created_before 必须是有效的日期时间')
    if (time > beforeTime) return false
  }
  return true
}

function parseSourceIds(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap(item => {
      if (typeof item === 'string') return [item]
      if (item && typeof item.id === 'string') return [item.id]
      return []
    })
  } catch {
    return []
  }
}

function plainTextFromHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function filtersFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 12)
}

function resolveModel(modelId?: string, strict = true): string {
  const models = getAvailableModels()
  const requested = modelId || getSettings().defaultModel
  if (requested) {
    const model = models.find(candidate => candidate.id === requested)
    if (model?.available) return model.id
    if (modelId && strict) {
      throw new DomainError('UNAVAILABLE', `模型 ${modelId} 不可用，请先安装模型或改用可用模型`)
    }
  }
  return models.find(model => model.available)?.id || 'sensevoice-small'
}

function validateExplicitMediaPath(filePath: string): void {
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(filePath)) throw new DomainError('INVALID_ARGUMENT', 'file_path 不能是 URL')
  if (!isAbsolute(filePath)) throw new DomainError('INVALID_ARGUMENT', 'file_path 必须是绝对路径')
  if (/[*?\[\]{}]/.test(filePath)) throw new DomainError('INVALID_ARGUMENT', 'file_path 不能包含通配符')
  if (!existsSync(filePath)) throw new DomainError('NOT_FOUND', '媒体文件不存在，请检查绝对路径')
  if (!statSync(filePath).isFile()) throw new DomainError('INVALID_ARGUMENT', 'file_path 必须指向一个媒体文件，不能是目录')
}

export async function createTranscriptionFromFile(params: {
  filePath: string
  modelId?: string
  source?: 'upload' | 'recording'
  sourceId?: string | null
  strictModel?: boolean
  startImmediately?: boolean
}): Promise<Task> {
  validateExplicitMediaPath(params.filePath)
  const validation = await validateFile(params.filePath)
  if (!validation.valid) throw new DomainError('INVALID_ARGUMENT', validation.error || '不支持的媒体文件')

  const modelType = resolveModel(params.modelId, params.strictModel !== false)
  const info = await getAudioInfo(params.filePath)
  const task = await createTask({
    fileName: basename(params.filePath),
    filePath: params.filePath,
    fileSize: statSync(params.filePath).size,
    duration: info.duration,
    modelType,
    source: params.source || 'upload',
    sourceId: params.sourceId ?? null,
  })

  registerFile({ filePath: params.filePath, ownerId: task.id, ownerType: 'task' })
  notifyAppDataChanged({ resource: 'transcriptions', action: 'created', id: task.id })
  if (params.startImmediately !== false) startQueue()
  return JSON.parse(JSON.stringify(task))
}

export async function createTranscriptionFromRecording(recordingId: string, modelId?: string): Promise<Task> {
  const recording = await getRealtimeRecording(recordingId)
  if (!recording) throw new DomainError('NOT_FOUND', '录音不存在，请重新获取录音列表并使用有效 ID')
  return createTranscriptionFromFile({
    filePath: recording.filePath,
    modelId,
    source: 'recording',
    sourceId: recording.id,
  })
}

export async function listRecordings(options: ListOptions = {}) {
  const [recordings, tasks] = await Promise.all([getAllRealtimeRecordings(), getAllTasks()])
  const transcribedIds = new Set(tasks
    .filter(task => task.source === 'recording' && task.sourceId && task.status === 'completed')
    .map(task => task.sourceId))
  const filters = { query: options.query || '', created_after: options.created_after || '', created_before: options.created_before || '' }
  const items = recordings
    .filter(recording => matchesText([recording.title], options.query))
    .filter(recording => matchesDates(recording.createdAt, options.created_after, options.created_before))
    .map<RecordingSummary>(recording => ({
      id: recording.id,
      title: recording.title,
      duration: recording.duration,
      size: recording.fileSize,
      created_at: recording.createdAt,
      transcription_available: transcribedIds.has(recording.id),
    }))
  return paginate(items, { scope: 'recordings', filters, cursor: options.cursor, limit: options.limit })
}

export async function listTranscriptions(options: ListOptions & { status?: Task['status'] } = {}) {
  const filters = {
    status: options.status || '', query: options.query || '',
    created_after: options.created_after || '', created_before: options.created_before || '',
  }
  const allTasks = await getAllTasks()
  const matching: Task[] = []
  for (const task of allTasks) {
    if (options.status && task.status !== options.status) continue
    if (!matchesDates(task.createdAt, options.created_after, options.created_before)) continue
    if (options.query) {
      const result = await getResult(task.id)
      if (!matchesText([task.fileName, task.error, result?.text], options.query)) continue
    }
    matching.push(task)
  }
  const tasks = matching.map<TranscriptionSummary>(task => ({
      task_id: task.id,
      file_name: task.fileName,
      status: task.status,
      duration: task.duration,
      word_count: task.wordCount,
      model: task.modelType,
      created_at: task.createdAt,
      completed_at: task.completedAt,
      ...(task.error ? { error: task.error.split('\n')[0] } : {}),
    }))
  return paginate(tasks, { scope: 'transcriptions', filters, cursor: options.cursor, limit: options.limit })
}

export async function getTranscriptionContent(params: {
  taskId: string
  cursor?: string
  maxChars?: number
  includeSegments?: boolean
}) {
  const task = await getTask(params.taskId)
  if (!task) throw new DomainError('NOT_FOUND', '转写任务不存在，请重新获取任务列表并使用有效 ID')
  const summary: TranscriptionSummary = {
    task_id: task.id,
    file_name: task.fileName,
    status: task.status,
    duration: task.duration,
    word_count: task.wordCount,
    model: task.modelType,
    created_at: task.createdAt,
    completed_at: task.completedAt,
    ...(task.error ? { error: task.error.split('\n')[0] } : {}),
  }
  if (task.status !== 'completed') return summary

  const result = await getResult(task.id)
  if (!result?.text) throw new DomainError('NOT_READY', '任务已完成但没有转写文本，请在桌面端检查任务结果')
  const chunk = chunkText(result.text, {
    scope: `transcription:${task.id}`,
    cursor: params.cursor,
    maxChars: params.maxChars,
  })

  let segments: Array<{ text: string; start: number; end: number; speaker?: string }> | undefined
  if (params.includeSegments && result.segments) {
    try {
      const allSegments = JSON.parse(result.segments) as Array<{ text: string; start: number; end: number; speaker?: string }>
      let position = 0
      segments = allSegments.filter(segment => {
        const start = position
        position += segment.text?.length || 0
        return position > chunk.start && start < chunk.end
      })
    } catch {
      segments = []
    }
  }

  return {
    ...summary,
    text: chunk.text,
    truncated: chunk.truncated,
    ...(chunk.nextCursor ? { next_cursor: chunk.nextCursor } : {}),
    ...(segments ? { segments } : {}),
  }
}

export async function listTemplates(options: ListOptions & { builtin?: boolean } = {}) {
  const filters = { query: options.query || '', builtin: options.builtin ?? null }
  const templates = (await getAllTemplates())
    .filter(template => options.builtin === undefined || Boolean(template.builtin) === options.builtin)
    .filter(template => matchesText([template.name, template.prompt], options.query))
    .map<TemplateSummary>(template => ({
      id: template.id,
      name: template.name,
      prompt: template.prompt,
      builtin: Boolean(template.builtin),
      updated_at: template.updatedAt,
    }))
  return paginate(templates, { scope: 'templates', filters, cursor: options.cursor, limit: options.limit })
}

export async function createDocumentFromTranscriptions(params: {
  transcriptionIds: string[]
  templateId: string
}): Promise<KnowledgeDoc> {
  const sourceIds = [...new Set(params.transcriptionIds)]
  if (sourceIds.length !== params.transcriptionIds.length) {
    throw new DomainError('INVALID_ARGUMENT', 'transcription_ids 不能包含重复的任务 ID')
  }
  if (sourceIds.length < 1 || sourceIds.length > 20) {
    throw new DomainError('INVALID_ARGUMENT', 'transcription_ids 必须包含 1-20 个不重复的任务 ID')
  }
  const template = await getTemplate(params.templateId)
  if (!template) throw new DomainError('NOT_FOUND', '模板不存在，请重新获取模板列表并使用有效 ID')

  const texts: string[] = []
  let firstSourceName = ''
  for (const taskId of sourceIds) {
    const [task, result] = await Promise.all([getTask(taskId), getResult(taskId)])
    if (!task) throw new DomainError('NOT_FOUND', `转写任务 ${taskId} 不存在`)
    if (task.status !== 'completed') throw new DomainError('NOT_READY', `转写任务 ${taskId} 尚未完成，请完成后重试`)
    if (!result?.text?.trim()) throw new DomainError('NOT_READY', `转写任务 ${taskId} 没有可用文本`)
    texts.push(result.text)
    if (!firstSourceName) firstSourceName = task.fileName.replace(/\.[^.]+$/, '')
  }

  const doc = await createKnowledgeDoc({
    title: firstSourceName ? `${template.name}：${firstSourceName}` : template.name,
    content: '',
    status: 'generating',
    templateId: template.id,
    sourceIds: JSON.stringify(sourceIds.map(id => ({ type: 'task', id }))),
  })

  notifyAppDataChanged({ resource: 'knowledge-documents', action: 'created', id: doc.id })
  void generateKnowledgeDocument(doc.id, template, texts)
  return doc
}

async function generateKnowledgeDocument(docId: string, template: KnowledgeTemplate, texts: string[]): Promise<void> {
  try {
    const prompt = getKnowledgeDocPrompt(template.prompt, texts)
    const content = await callLLM(getSettings(), prompt.system, prompt.user, 1, false)
    let cleanContent = content.trim()
    if (cleanContent.startsWith('```')) {
      cleanContent = cleanContent.replace(/^```(?:html)?\s*/, '').replace(/\s*```$/, '')
    }
    await updateKnowledgeDoc(docId, { content: cleanContent, status: 'completed' })
    notifyAppDataChanged({ resource: 'knowledge-documents', action: 'updated', id: docId })
  } catch (error) {
    logError('generate-knowledge-document', error)
    await updateKnowledgeDoc(docId, {
      title: '生成失败',
      status: 'failed',
      error: error instanceof Error ? error.message : '生成失败',
    })
    notifyAppDataChanged({ resource: 'knowledge-documents', action: 'updated', id: docId })
  }
}

function documentSummary(doc: KnowledgeDoc): DocumentSummary {
  return {
    document_id: doc.id,
    title: doc.title,
    status: doc.status,
    template_id: doc.templateId,
    source_transcription_ids: parseSourceIds(doc.sourceIds),
    ...(doc.error ? { error: doc.error } : {}),
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
  }
}

export async function listDocuments(options: ListOptions & { status?: KnowledgeDoc['status'] } = {}) {
  const filters = {
    status: options.status || '', query: options.query || '',
    created_after: options.created_after || '', created_before: options.created_before || '',
  }
  const docs = (await getAllKnowledgeDocs())
    .filter(doc => !options.status || doc.status === options.status)
    .filter(doc => matchesText([doc.title, doc.error, doc.content], options.query))
    .filter(doc => matchesDates(doc.createdAt, options.created_after, options.created_before))
    .map(documentSummary)
  return paginate(docs, { scope: 'documents', filters, cursor: options.cursor, limit: options.limit })
}

export async function getDocumentContent(params: {
  documentId: string
  format?: 'text' | 'html'
  cursor?: string
  maxChars?: number
}) {
  const doc = await getKnowledgeDoc(params.documentId)
  if (!doc) throw new DomainError('NOT_FOUND', '知识文档不存在，请重新获取文档列表并使用有效 ID')
  const summary = documentSummary(doc)
  if (doc.status !== 'completed') return summary

  const format = params.format || 'text'
  const content = format === 'html' ? doc.content : plainTextFromHtml(doc.content)
  const chunk = chunkText(content, {
    scope: `document:${doc.id}:${format}:${filtersFingerprint(doc.updatedAt)}`,
    cursor: params.cursor,
    maxChars: params.maxChars,
  })
  return {
    ...summary,
    format,
    content: chunk.text,
    truncated: chunk.truncated,
    ...(chunk.nextCursor ? { next_cursor: chunk.nextCursor } : {}),
    ...(format === 'html' ? { html_chunks_require_concatenation: true } : {}),
  }
}

export async function getRecording(recordingId: string): Promise<RealtimeRecording> {
  const recording = await getRealtimeRecording(recordingId)
  if (!recording) throw new DomainError('NOT_FOUND', '录音记录不存在')
  return JSON.parse(JSON.stringify(recording))
}

export async function getAllRecordingsForIpc(): Promise<RealtimeRecording[]> {
  return JSON.parse(JSON.stringify(await getAllRealtimeRecordings()))
}

export async function addFilesForIpc(filePaths: string[], modelId?: string): Promise<{ tasks: Task[]; errors: string[] }> {
  const tasks: Task[] = []
  const errors: string[] = []
  for (const filePath of filePaths) {
    try {
      tasks.push(await createTranscriptionFromFile({
        filePath,
        modelId,
        strictModel: false,
        startImmediately: false,
      }))
    } catch (error) {
      errors.push(`${basename(filePath)}: ${error instanceof Error ? error.message : '未知错误'}`)
      logError('addFilesForIpc', error)
    }
  }
  if (tasks.length > 0) startQueue()
  return { tasks, errors }
}

export async function getAllTranscriptionsForIpc(): Promise<Task[]> {
  return JSON.parse(JSON.stringify(await getAllTasks()))
}

export async function getTranscriptionResultForIpc(taskId: string): Promise<unknown> {
  const task = await getTask(taskId)
  if (!task) throw new DomainError('NOT_FOUND', '任务不存在')
  const result = await getResult(taskId) as any
  if (!result) throw new DomainError('NOT_FOUND', '结果不存在')
  return JSON.parse(JSON.stringify({
    task,
    result: {
      text: result.text,
      segments: result.segments ? JSON.parse(result.segments) : undefined,
      speakerStats: result.speakerStats ? JSON.parse(result.speakerStats) : undefined,
      keywords: result.keywords ? JSON.parse(result.keywords) : undefined,
      lang: result.lang,
      strategy: result.strategy,
      aiSummary: result.aiSummary || null,
      aiSpeakers: result.aiSpeakers || null,
      aiMinutes: result.aiMinutes || null,
      aiQa: result.aiQa || null,
    },
  }))
}

export async function getAllDocumentsForIpc(): Promise<KnowledgeDoc[]> {
  return JSON.parse(JSON.stringify(await getAllKnowledgeDocs()))
}

export async function getDocumentForIpc(documentId: string): Promise<KnowledgeDoc> {
  const doc = await getKnowledgeDoc(documentId)
  if (!doc) throw new DomainError('NOT_FOUND', '文档不存在')
  return JSON.parse(JSON.stringify(doc))
}

export async function getAllTemplatesForIpc(): Promise<KnowledgeTemplate[]> {
  return JSON.parse(JSON.stringify(await getAllTemplates()))
}
