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
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'stopped'
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

export async function createTask(file: { fileName: string; filePath: string; fileSize: number; duration: number; modelType?: string }): Promise<Task> {
  const d = await getDb()
  const task: Task = {
    id: randomUUID(),
    fileName: file.fileName,
    filePath: file.filePath,
    fileSize: file.fileSize,
    duration: file.duration,
    status: 'pending',
    modelType: file.modelType || 'qwen3-asr',
    strategy: null,
    error: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
    processingTime: null,
    wordCount: null,
  }

  d.run(
    'INSERT INTO tasks (id, fileName, filePath, fileSize, duration, status, modelType, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [task.id, task.fileName, task.filePath, task.fileSize, task.duration, task.status, task.modelType, task.createdAt]
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
