import { app } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { randomUUID } from 'crypto'
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'

let db: SqlJsDatabase | null = null
let dbPath: string = ''

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

export interface TaskResult {
  taskId: string
  text: string
  segments: string | null
  speakerStats: string | null
  keywords: string | null
  lang: string
  strategy: string | null
}

export interface RealtimeRecording {
  id: string
  title: string
  filePath: string
  fileSize: number
  duration: number
  wordCount: number
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

async function getDb(): Promise<SqlJsDatabase> {
  if (db) return db

  const SQL = await initSqlJs()
  dbPath = join(app.getPath('userData'), 'tasks.db')

  if (existsSync(dbPath)) {
    const buffer = readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      fileName TEXT NOT NULL,
      filePath TEXT NOT NULL,
      fileSize INTEGER DEFAULT 0,
      duration REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      modelType TEXT DEFAULT 'qwen3-asr',
      strategy TEXT,
      error TEXT,
      createdAt TEXT NOT NULL,
      completedAt TEXT,
      processingTime REAL,
      wordCount INTEGER
    )
  `)

  // 迁移：为旧数据库添加 modelType 列
  try {
    db.run(`ALTER TABLE tasks ADD COLUMN modelType TEXT DEFAULT 'qwen3-asr'`)
  } catch (e) {
    // 列已存在，忽略错误
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS results (
      taskId TEXT PRIMARY KEY,
      text TEXT,
      segments TEXT,
      speakerStats TEXT,
      keywords TEXT,
      lang TEXT,
      strategy TEXT,
      aiSummary TEXT,
      aiSpeakers TEXT,
      aiMinutes TEXT,
      aiQa TEXT
    )
  `)

  // 迁移：为旧 results 表添加 AI 分析列
  const aiCols = ['aiSummary', 'aiSpeakers', 'aiMinutes', 'aiQa']
  for (const col of aiCols) {
    try { db.run(`ALTER TABLE results ADD COLUMN ${col} TEXT`) } catch { /* already exists */ }
  }

  // 创建 realtime_recordings 表
  db.run(`
    CREATE TABLE IF NOT EXISTS realtime_recordings (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      filePath TEXT NOT NULL,
      fileSize INTEGER DEFAULT 0,
      duration REAL DEFAULT 0,
      wordCount INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL,
      text TEXT,
      segments TEXT
    )
  `)

  // 创建 knowledge_docs 表
  db.run(`
    CREATE TABLE IF NOT EXISTS knowledge_docs (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'generating',
      templateId TEXT,
      sourceIds TEXT,
      error TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `)

  // 迁移：为旧 knowledge_docs 表添加 status 和 error 列
  try { db.run(`ALTER TABLE knowledge_docs ADD COLUMN status TEXT DEFAULT 'completed'`) } catch { /* already exists */ }
  try { db.run(`ALTER TABLE knowledge_docs ADD COLUMN error TEXT`) } catch { /* already exists */ }

  // 创建 knowledge_templates 表
  db.run(`
    CREATE TABLE IF NOT EXISTS knowledge_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      prompt TEXT NOT NULL,
      builtin INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    )
  `)

  // 初始化预设模板
  await initBuiltinTemplates(db)

  return db
}

function saveDb() {
  if (db && dbPath) {
    const data = db.export()
    writeFileSync(dbPath, Buffer.from(data))
  }
}

function queryAll(d: SqlJsDatabase, sql: string, params: any[] = []): any[] {
  const stmt = d.prepare(sql)
  if (params.length) stmt.bind(params)
  const rows: any[] = []
  while (stmt.step()) {
    rows.push(JSON.parse(JSON.stringify(stmt.getAsObject())))
  }
  stmt.free()
  return rows
}

function queryOne(d: SqlJsDatabase, sql: string, params: any[] = []): any | undefined {
  const rows = queryAll(d, sql, params)
  return rows[0]
}

// ===== Task CRUD =====

export async function createTask(file: { fileName: string; filePath: string; fileSize: number; duration: number; modelType?: string; status?: Task['status']; wordCount?: number }): Promise<Task> {
  const d = await getDb()
  const task: Task = {
    id: randomUUID(),
    fileName: file.fileName,
    filePath: file.filePath,
    fileSize: file.fileSize,
    duration: file.duration,
    status: file.status || 'pending',
    modelType: file.modelType || 'qwen3-asr',
    strategy: null,
    error: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    processingTime: null,
    wordCount: file.wordCount ?? null,
  }

  d.run(
    'INSERT INTO tasks (id, fileName, filePath, fileSize, duration, status, modelType, createdAt, wordCount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [task.id, task.fileName, task.filePath, task.fileSize, task.duration, task.status, task.modelType, task.createdAt, task.wordCount]
  )
  saveDb()
  return task
}

export async function getTask(id: string): Promise<Task | undefined> {
  const d = await getDb()
  return queryOne(d, 'SELECT * FROM tasks WHERE id = ?', [id])
}

export async function getAllTasks(): Promise<Task[]> {
  const d = await getDb()
  return queryAll(d, 'SELECT * FROM tasks ORDER BY createdAt DESC')
}

export async function updateTask(id: string, updates: Partial<Pick<Task, 'status' | 'strategy' | 'error' | 'completedAt' | 'processingTime' | 'wordCount'>>) {
  const d = await getDb()
  const fields: string[] = []
  const values: any[] = []

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`)
      values.push(value)
    }
  }

  if (fields.length === 0) return
  values.push(id)

  d.run(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, values)
  saveDb()
}

export async function deleteTask(id: string) {
  const d = await getDb()
  // Clean up recording WAV file if in recordings directory
  const task = await getTask(id)
  if (task?.filePath) {
    const recordingsDir = join(app.getPath('userData'), 'recordings')
    if (task.filePath.startsWith(recordingsDir) && existsSync(task.filePath)) {
      try { const { unlinkSync } = require('fs'); unlinkSync(task.filePath) } catch { /* ignore */ }
    }
  }
  d.run('DELETE FROM results WHERE taskId = ?', [id])
  d.run('DELETE FROM tasks WHERE id = ?', [id])
  saveDb()
}

// ===== Result CRUD =====

export async function saveResult(taskId: string, result: {
  text: string
  segments?: any[]
  speakerStats?: Record<string, any>
  keywords?: any[]
  lang: string
  strategy?: string
}) {
  const d = await getDb()
  d.run(
    'INSERT OR REPLACE INTO results (taskId, text, segments, speakerStats, keywords, lang, strategy) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      taskId,
      result.text,
      result.segments ? JSON.stringify(result.segments) : null,
      result.speakerStats ? JSON.stringify(result.speakerStats) : null,
      result.keywords ? JSON.stringify(result.keywords) : null,
      result.lang,
      result.strategy || null,
    ]
  )
  saveDb()
}

export async function getResult(taskId: string): Promise<TaskResult | undefined> {
  const d = await getDb()
  return queryOne(d, 'SELECT * FROM results WHERE taskId = ?', [taskId])
}

export async function updateResultAnalysis(taskId: string, field: string, value: string) {
  const d = await getDb()
  const allowed = ['aiSummary', 'aiSpeakers', 'aiMinutes', 'aiQa']
  if (!allowed.includes(field)) return
  d.run(`UPDATE results SET ${field} = ? WHERE taskId = ?`, [value, taskId])
  saveDb()
}

// ===== RealtimeRecording CRUD =====

export async function createRealtimeRecording(recording: {
  title: string
  filePath: string
  fileSize: number
  duration: number
  wordCount: number
  text: string
  segments: any[]
}): Promise<RealtimeRecording> {
  const d = await getDb()
  const rec: RealtimeRecording = {
    id: randomUUID(),
    title: recording.title,
    filePath: recording.filePath,
    fileSize: recording.fileSize,
    duration: recording.duration,
    wordCount: recording.wordCount,
    createdAt: new Date().toISOString(),
    text: recording.text,
    segments: JSON.stringify(recording.segments),
  }

  d.run(
    'INSERT INTO realtime_recordings (id, title, filePath, fileSize, duration, wordCount, createdAt, text, segments) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [rec.id, rec.title, rec.filePath, rec.fileSize, rec.duration, rec.wordCount, rec.createdAt, rec.text, rec.segments]
  )
  saveDb()
  return rec
}

export async function getAllRealtimeRecordings(): Promise<RealtimeRecording[]> {
  const d = await getDb()
  return queryAll(d, 'SELECT * FROM realtime_recordings ORDER BY createdAt DESC')
}

export async function getRealtimeRecording(id: string): Promise<RealtimeRecording | undefined> {
  const d = await getDb()
  return queryOne(d, 'SELECT * FROM realtime_recordings WHERE id = ?', [id])
}

export async function deleteRealtimeRecording(id: string) {
  const d = await getDb()
  d.run('DELETE FROM realtime_recordings WHERE id = ?', [id])
  saveDb()
}

export async function getNextPendingTask(): Promise<Task | undefined> {
  const d = await getDb()
  return queryOne(d, "SELECT * FROM tasks WHERE status = 'pending' ORDER BY createdAt ASC LIMIT 1")
}

export async function hasProcessingTask(): Promise<boolean> {
  const d = await getDb()
  const row = queryOne(d, "SELECT COUNT(*) as count FROM tasks WHERE status = 'processing'")
  return row?.count > 0
}

export function closeDb() {
  if (db) {
    saveDb()
    db.close()
    db = null
  }
}

/**
 * 启动时重置残留的 processing 任务为 pending
 */
export async function resetStaleTasks() {
  const d = await getDb()
  d.run("UPDATE tasks SET status = 'pending' WHERE status = 'processing'")
  saveDb()
}

// ===== 预设模板初始化 =====

const BUILTIN_TEMPLATES = [
  { id: 'tpl-meeting', name: '会议纪要', prompt: '请将以下语音转写内容整理为一份结构化的会议纪要。要求包含以下章节：\n\n1. 参会背景：简要说明会议主题和背景。\n2. 讨论要点：按话题分条列出讨论的核心内容。\n3. 决议事项：列出会议中达成的决定。\n4. 待办事项：列出需要跟进的任务，标注负责人和截止时间（如有提及）。\n\n语言流畅、条理清晰。' },
  { id: 'tpl-study', name: '学习笔记', prompt: '请将以下语音转写内容整理为一份学习笔记。要求包含以下章节：\n\n1. 主题概述：简要概括学习内容的主题和背景。\n2. 核心知识点：按逻辑顺序列出关键知识点，每个知识点用小标题标注。\n3. 要点总结：用简洁的语言总结最重要的收获。\n\n适合日后复习回顾。' },
  { id: 'tpl-weekly', name: '周报总结', prompt: '请将以下多条语音转写内容整理为一份周报总结。要求包含以下章节：\n\n1. 本周工作：按类别或项目分条列出本周完成的工作。\n2. 重点进展：详细说明重要事项的进展情况。\n3. 下周计划：列出下周的工作计划和目标。\n\n语言简洁专业。' },
  { id: 'tpl-interview', name: '访谈整理', prompt: '请将以下语音转写内容整理为一份访谈记录。要求包含以下章节：\n\n1. 访谈背景：简要说明访谈的目的和背景。\n2. 核心问答：按话题分组，以问答格式整理访谈内容。\n3. 关键观点：提炼受访者的核心观点和有价值的见解。\n\n忠实于原始内容。' },
  { id: 'tpl-free', name: '自由整理', prompt: '请将以下语音转写内容进行整理和润色，使其结构清晰、语言流畅。根据内容自动判断合适的文档结构。' },
]

function initBuiltinTemplates(database: SqlJsDatabase) {
  const now = new Date().toISOString()
  for (const tpl of BUILTIN_TEMPLATES) {
    const exists = queryOne(database, 'SELECT id FROM knowledge_templates WHERE id = ?', [tpl.id])
    if (!exists) {
      // 不存在则插入
      database.run(
        'INSERT INTO knowledge_templates (id, name, prompt, builtin, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)',
        [tpl.id, tpl.name, tpl.prompt, now, now]
      )
    } else {
      // 已存在则更新 prompt（保持预设模板与代码同步）
      database.run(
        'UPDATE knowledge_templates SET name = ?, prompt = ?, updatedAt = ? WHERE id = ?',
        [tpl.name, tpl.prompt, now, tpl.id]
      )
    }
  }
  saveDb()
}

// ===== Knowledge Docs CRUD =====

export async function createKnowledgeDoc(doc: { title: string; content?: string; status?: 'generating' | 'completed' | 'failed'; templateId: string; sourceIds: string; error?: string }): Promise<KnowledgeDoc> {
  const d = await getDb()
  const id = randomUUID()
  const now = new Date().toISOString()
  const status = doc.status || 'generating'
  const content = doc.content || ''
  const error = doc.error || null
  d.run(
    'INSERT INTO knowledge_docs (id, title, content, status, templateId, sourceIds, error, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, doc.title, content, status, doc.templateId, doc.sourceIds, error, now, now]
  )
  saveDb()
  return { id, title: doc.title, content, status, templateId: doc.templateId, sourceIds: doc.sourceIds, error, createdAt: now, updatedAt: now }
}

export async function getKnowledgeDoc(id: string): Promise<KnowledgeDoc | undefined> {
  const d = await getDb()
  return queryOne(d, 'SELECT * FROM knowledge_docs WHERE id = ?', [id])
}

export async function getAllKnowledgeDocs(): Promise<KnowledgeDoc[]> {
  const d = await getDb()
  return queryAll(d, 'SELECT * FROM knowledge_docs ORDER BY updatedAt DESC')
}

export async function updateKnowledgeDoc(id: string, updates: { title?: string; content?: string; status?: 'generating' | 'completed' | 'failed'; error?: string }): Promise<void> {
  const d = await getDb()
  const sets: string[] = ['updatedAt = ?']
  const vals: any[] = [new Date().toISOString()]
  if (updates.title !== undefined) { sets.push('title = ?'); vals.push(updates.title) }
  if (updates.content !== undefined) { sets.push('content = ?'); vals.push(updates.content) }
  if (updates.status !== undefined) { sets.push('status = ?'); vals.push(updates.status) }
  if (updates.error !== undefined) { sets.push('error = ?'); vals.push(updates.error) }
  vals.push(id)
  d.run(`UPDATE knowledge_docs SET ${sets.join(', ')} WHERE id = ?`, vals)
  saveDb()
}

export async function deleteKnowledgeDoc(id: string): Promise<void> {
  const d = await getDb()
  d.run('DELETE FROM knowledge_docs WHERE id = ?', [id])
  saveDb()
}

// ===== Knowledge Templates CRUD =====

export async function getAllTemplates(): Promise<KnowledgeTemplate[]> {
  const d = await getDb()
  return queryAll(d, 'SELECT * FROM knowledge_templates ORDER BY builtin DESC, createdAt ASC')
}

export async function getTemplate(id: string): Promise<KnowledgeTemplate | undefined> {
  const d = await getDb()
  return queryOne(d, 'SELECT * FROM knowledge_templates WHERE id = ?', [id])
}

export async function createTemplate(tpl: { name: string; prompt: string }): Promise<KnowledgeTemplate> {
  const d = await getDb()
  const id = randomUUID()
  const now = new Date().toISOString()
  d.run(
    'INSERT INTO knowledge_templates (id, name, prompt, builtin, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?)',
    [id, tpl.name, tpl.prompt, now, now]
  )
  saveDb()
  return { id, name: tpl.name, prompt: tpl.prompt, builtin: 0, createdAt: now, updatedAt: now }
}

export async function updateTemplate(id: string, updates: { name?: string; prompt?: string }): Promise<void> {
  const d = await getDb()
  const sets: string[] = ['updatedAt = ?']
  const vals: any[] = [new Date().toISOString()]
  if (updates.name !== undefined) { sets.push('name = ?'); vals.push(updates.name) }
  if (updates.prompt !== undefined) { sets.push('prompt = ?'); vals.push(updates.prompt) }
  vals.push(id)
  d.run(`UPDATE knowledge_templates SET ${sets.join(', ')} WHERE id = ? AND builtin = 0`, vals)
  saveDb()
}

export async function deleteTemplate(id: string): Promise<void> {
  const d = await getDb()
  d.run('DELETE FROM knowledge_templates WHERE id = ? AND builtin = 0', [id])
  saveDb()
}
