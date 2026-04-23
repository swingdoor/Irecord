import { existsSync, statSync, unlinkSync } from 'fs'
import { randomUUID } from 'crypto'

// sql.js Database type (avoid circular import)
type SqlJsDatabase = any

export interface ManagedFile {
  id: string
  filePath: string
  fileSize: number
  mimeType: string
  createdAt: string
  lastAccessedAt: string
}

export interface FileReference {
  id: string
  fileId: string
  ownerId: string
  ownerType: string
  createdAt: string
}

const MIME_MAP: Record<string, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  mov: 'video/quicktime',
}

function inferMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  return MIME_MAP[ext] || 'application/octet-stream'
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

let _db: SqlJsDatabase | null = null
let _saveDb: (() => void) | null = null

export function initFileManager(db: SqlJsDatabase, saveDb: () => void): void {
  _db = db
  _saveDb = saveDb

  // 创建 managed_files 表
  db.run(`
    CREATE TABLE IF NOT EXISTS managed_files (
      id TEXT PRIMARY KEY,
      filePath TEXT NOT NULL UNIQUE,
      fileSize INTEGER NOT NULL,
      mimeType TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      lastAccessedAt TEXT NOT NULL
    )
  `)

  // 创建 file_references 表
  db.run(`
    CREATE TABLE IF NOT EXISTS file_references (
      id TEXT PRIMARY KEY,
      fileId TEXT NOT NULL,
      ownerId TEXT NOT NULL,
      ownerType TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (fileId) REFERENCES managed_files(id) ON DELETE CASCADE
    )
  `)

  // 创建索引
  db.run(`CREATE INDEX IF NOT EXISTS idx_file_references_owner ON file_references(ownerId, ownerType)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_file_references_file ON file_references(fileId)`)

  // 为 tasks 和 realtime_recordings 添加 fileId 列
  try { db.run(`ALTER TABLE tasks ADD COLUMN fileId TEXT`) } catch { /* already exists */ }
  try { db.run(`ALTER TABLE realtime_recordings ADD COLUMN fileId TEXT`) } catch { /* already exists */ }

  saveDb()
}

/**
 * 注册文件并创建初始引用
 */
export function registerFile(params: {
  filePath: string
  ownerId: string
  ownerType: 'task' | 'recording'
}): string {
  if (!_db || !_saveDb) throw new Error('FileManager not initialized')

  const now = new Date().toISOString()

  // 检查文件是否已注册
  const existing = queryOne(_db, 'SELECT id FROM managed_files WHERE filePath = ?', [params.filePath])
  let fileId: string

  if (existing) {
    fileId = existing.id
  } else {
    fileId = randomUUID()
    let fileSize = 0
    try {
      if (existsSync(params.filePath)) {
        fileSize = statSync(params.filePath).size
      }
    } catch { /* ignore */ }

    const mimeType = inferMimeType(params.filePath)

    _db.run(
      'INSERT INTO managed_files (id, filePath, fileSize, mimeType, createdAt, lastAccessedAt) VALUES (?, ?, ?, ?, ?, ?)',
      [fileId, params.filePath, fileSize, mimeType, now, now]
    )
  }

  // 检查引用是否已存在
  const existingRef = queryOne(
    _db,
    'SELECT id FROM file_references WHERE fileId = ? AND ownerId = ? AND ownerType = ?',
    [fileId, params.ownerId, params.ownerType]
  )

  if (!existingRef) {
    _db.run(
      'INSERT INTO file_references (id, fileId, ownerId, ownerType, createdAt) VALUES (?, ?, ?, ?, ?)',
      [randomUUID(), fileId, params.ownerId, params.ownerType, now]
    )
  }

  _saveDb()
  return fileId
}

/**
 * 为已存在文件添加引用
 */
export function addReference(params: {
  fileId: string
  ownerId: string
  ownerType: 'task' | 'recording'
}): void {
  if (!_db || !_saveDb) throw new Error('FileManager not initialized')

  const existingRef = queryOne(
    _db,
    'SELECT id FROM file_references WHERE fileId = ? AND ownerId = ? AND ownerType = ?',
    [params.fileId, params.ownerId, params.ownerType]
  )

  if (!existingRef) {
    _db.run(
      'INSERT INTO file_references (id, fileId, ownerId, ownerType, createdAt) VALUES (?, ?, ?, ?, ?)',
      [randomUUID(), params.fileId, params.ownerId, params.ownerType, new Date().toISOString()]
    )
    _saveDb()
  }
}

/**
 * 移除引用（不删文件）
 */
export function removeReference(params: {
  ownerId: string
  ownerType: 'task' | 'recording'
}): void {
  if (!_db || !_saveDb) throw new Error('FileManager not initialized')

  _db.run(
    'DELETE FROM file_references WHERE ownerId = ? AND ownerType = ?',
    [params.ownerId, params.ownerType]
  )
  _saveDb()
}

/**
 * 通过 fileId 获取文件信息
 */
export function getFile(fileId: string): ManagedFile | undefined {
  if (!_db) throw new Error('FileManager not initialized')

  const file = queryOne(_db, 'SELECT * FROM managed_files WHERE id = ?', [fileId])

  if (file) {
    // 更新最后访问时间
    _db.run('UPDATE managed_files SET lastAccessedAt = ? WHERE id = ?', [new Date().toISOString(), fileId])
    _saveDb?.()
  }

  return file
}

/**
 * 通过所有者获取文件
 */
export function getFileByOwner(params: {
  ownerId: string
  ownerType: string
}): ManagedFile | undefined {
  if (!_db) throw new Error('FileManager not initialized')

  const ref = queryOne(
    _db,
    'SELECT fileId FROM file_references WHERE ownerId = ? AND ownerType = ?',
    [params.ownerId, params.ownerType]
  )

  if (!ref) return undefined
  return getFile(ref.fileId)
}

/**
 * 获取文件的所有引用
 */
export function getReferences(fileId: string): FileReference[] {
  if (!_db) throw new Error('FileManager not initialized')
  return queryAll(_db, 'SELECT * FROM file_references WHERE fileId = ?', [fileId])
}

/**
 * 清理无引用的孤儿文件
 */
export function cleanupOrphanFiles(): { deletedCount: number; freedSpace: number } {
  if (!_db || !_saveDb) throw new Error('FileManager not initialized')

  // 找出没有引用的文件
  const orphans = queryAll(
    _db,
    `SELECT mf.* FROM managed_files mf
     LEFT JOIN file_references fr ON mf.id = fr.fileId
     WHERE fr.id IS NULL`
  )

  let deletedCount = 0
  let freedSpace = 0

  for (const orphan of orphans) {
    // 删除物理文件
    if (orphan.filePath && existsSync(orphan.filePath)) {
      try {
        unlinkSync(orphan.filePath)
        freedSpace += orphan.fileSize || 0
        deletedCount++
      } catch {
        // 删除失败，跳过
      }
    } else {
      deletedCount++
    }

    // 删除数据库记录
    _db.run('DELETE FROM managed_files WHERE id = ?', [orphan.id])
  }

  if (deletedCount > 0) {
    _saveDb()
  }

  return { deletedCount, freedSpace }
}

/**
 * 检查文件完整性
 */
export function verifyIntegrity(): { missingFiles: string[]; brokenReferences: string[] } {
  if (!_db) throw new Error('FileManager not initialized')

  const missingFiles: string[] = []
  const brokenReferences: string[] = []

  // 检查文件是否存在
  const files = queryAll(_db, 'SELECT * FROM managed_files')
  for (const file of files) {
    if (!existsSync(file.filePath)) {
      missingFiles.push(`${file.id}: ${file.filePath}`)
    }
  }

  // 检查引用是否指向有效文件
  const refs = queryAll(_db, `
    SELECT fr.*, mf.id as mfId FROM file_references fr
    LEFT JOIN managed_files mf ON fr.fileId = mf.id
    WHERE mf.id IS NULL
  `)
  for (const ref of refs) {
    brokenReferences.push(`${ref.id}: owner=${ref.ownerId}(${ref.ownerType}), fileId=${ref.fileId}`)
  }

  return { missingFiles, brokenReferences }
}

/**
 * 迁移现有数据到文件管理系统
 */
export function migrateExistingData(): void {
  if (!_db || !_saveDb) throw new Error('FileManager not initialized')

  let migratedRecordings = 0
  let migratedTasks = 0

  // 迁移 realtime_recordings
  const recordings = queryAll(_db, 'SELECT id, filePath, fileId FROM realtime_recordings WHERE fileId IS NULL AND filePath IS NOT NULL')
  for (const rec of recordings) {
    try {
      const fileId = registerFile({
        filePath: rec.filePath,
        ownerId: rec.id,
        ownerType: 'recording'
      })
      _db.run('UPDATE realtime_recordings SET fileId = ? WHERE id = ?', [fileId, rec.id])
      migratedRecordings++
    } catch {
      // 迁移失败，跳过
    }
  }

  // 迁移 tasks
  const tasks = queryAll(_db, 'SELECT id, filePath, fileId FROM tasks WHERE fileId IS NULL AND filePath IS NOT NULL')
  for (const task of tasks) {
    try {
      const fileId = registerFile({
        filePath: task.filePath,
        ownerId: task.id,
        ownerType: 'task'
      })
      _db.run('UPDATE tasks SET fileId = ? WHERE id = ?', [fileId, task.id])
      migratedTasks++
    } catch {
      // 迁移失败，跳过
    }
  }

  if (migratedRecordings > 0 || migratedTasks > 0) {
    _saveDb()
  }
}
