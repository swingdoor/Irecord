import { join } from 'path'
import { existsSync } from 'fs'
import { type ModelEntry } from './registry'
import { findModelDir, getUserModelsPath } from '../utils/paths'

export type ModelLocation = 'bundled' | 'user' | 'custom'
export type ModelStatus = 'installed' | 'not-installed' | 'downloading'

export interface ModelStatusInfo {
  id: string
  status: ModelStatus
  location?: ModelLocation
  path?: string
  deletable: boolean
}

// Track active downloads (set by downloader)
const activeDownloads = new Set<string>()

export function markDownloading(modelId: string): void {
  activeDownloads.add(modelId)
}

export function unmarkDownloading(modelId: string): void {
  activeDownloads.delete(modelId)
}

export function getModelStatus(entry: ModelEntry): ModelStatusInfo {
  if (activeDownloads.has(entry.id)) {
    return { id: entry.id, status: 'downloading', deletable: false }
  }

  const found = findModelDir(entry.folderName)
  if (!found) {
    return { id: entry.id, status: 'not-installed', deletable: false }
  }

  // Verify all required files exist
  const allFilesExist = entry.requiredFiles.every((f) =>
    existsSync(join(found.path, f))
  )

  if (!allFilesExist) {
    return { id: entry.id, status: 'not-installed', deletable: false }
  }

  return {
    id: entry.id,
    status: 'installed',
    location: found.location === 'bundled' ? 'bundled' : found.location === 'user' ? 'user' : 'custom',
    path: found.path,
    deletable: found.location === 'user' || found.location === 'custom',
  }
}

export function getDownloadTargetPath(entry: ModelEntry): string {
  return join(getUserModelsPath(), entry.folderName)
}
