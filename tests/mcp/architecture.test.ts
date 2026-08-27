import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
}

test('IPC and MCP adapters share application services without crossing adapters', () => {
  const taskHandlers = source('src/main/ipc/taskHandlers.ts')
  const recordingHandlers = source('src/main/ipc/recordingHandlers.ts')
  const knowledgeHandlers = source('src/main/ipc/knowledgeHandlers.ts')
  const applicationService = source('src/main/services/applicationService.ts')
  const mcpTools = source('src/main/mcp/tools.ts')

  assert.match(taskHandlers, /addFilesForIpc/)
  assert.match(recordingHandlers, /getAllRecordingsForIpc/)
  assert.match(knowledgeHandlers, /createDocumentFromTranscriptions/)
  assert.match(applicationService, /createTranscriptionFromFile/)
  assert.match(applicationService, /createDocumentFromTranscriptions/)
  assert.match(mcpTools, /operations\.createTranscriptionFromFile/)
  assert.match(mcpTools, /operations\.createDocumentFromTranscriptions/)
  assert.doesNotMatch(mcpTools, /ipcMain|ipcRenderer/)
})

test('shared MCP mutations invalidate renderer data without polling', () => {
  const applicationService = source('src/main/services/applicationService.ts')
  const taskQueue = source('src/main/taskQueue.ts')
  const preload = source('src/preload/index.ts')
  const app = source('src/renderer/src/App.tsx')
  const taskList = source('src/renderer/src/pages/TaskListPage.tsx')

  assert.match(applicationService, /resource: 'transcriptions', action: 'created'/)
  assert.match(applicationService, /resource: 'knowledge-documents', action: 'created'/)
  assert.match(applicationService, /resource: 'knowledge-documents', action: 'updated'/)
  assert.match(taskQueue, /resource: 'transcriptions', action: 'updated'/)
  assert.match(preload, /onAppDataChanged/)
  assert.match(app, /onAppDataChanged/)
  assert.doesNotMatch(taskList, /setInterval\(/)
})
