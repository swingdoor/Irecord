import { tmpdir } from 'os'
import { join } from 'path'
import { mkdirSync, existsSync, readdirSync, unlinkSync, statSync } from 'fs'

const TEMP_DIR_NAME = 'irecord-temp'

/**
 * 获取应用临时目录
 */
export function getTempDir(): string {
  const tempDir = join(tmpdir(), TEMP_DIR_NAME)
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true })
  }
  return tempDir
}

/**
 * 清理所有临时文件
 */
export function cleanupTempFiles(): void {
  const tempDir = getTempDir()
  if (!existsSync(tempDir)) {
    return
  }

  try {
    const files = readdirSync(tempDir)
    for (const file of files) {
      const filePath = join(tempDir, file)
      try {
        unlinkSync(filePath)
      } catch (err) {
        console.error(`无法删除临时文件 ${filePath}:`, err)
      }
    }
  } catch (err) {
    console.error('清理临时文件失败:', err)
  }
}

/**
 * 清理超过指定时间的临时文件
 * @param maxAgeMs 最大保留时间（毫秒），默认 1 小时
 */
export function cleanupOldTempFiles(maxAgeMs: number = 3600000): void {
  const tempDir = getTempDir()
  if (!existsSync(tempDir)) {
    return
  }

  const now = Date.now()

  try {
    const files = readdirSync(tempDir)
    for (const file of files) {
      const filePath = join(tempDir, file)
      try {
        const stats = statSync(filePath)
        const age = now - stats.mtimeMs
        if (age > maxAgeMs) {
          unlinkSync(filePath)
        }
      } catch (err) {
        console.error(`无法处理临时文件 ${filePath}:`, err)
      }
    }
  } catch (err) {
    console.error('清理过期临时文件失败:', err)
  }
}

/**
 * 删除指定的临时文件
 */
export function deleteTempFile(filePath: string): void {
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath)
    }
  } catch (err) {
    console.error(`删除临时文件失败 ${filePath}:`, err)
  }
}
