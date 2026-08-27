import assert from 'node:assert/strict'
import test from 'node:test'
import { Client, InMemoryTransport } from '@modelcontextprotocol/client'
import { createIRecordMcpServer, IRECORD_MCP_TOOL_NAMES, type McpOperations } from '../../src/main/mcp/tools'
import { RequestDeduper } from '../../src/main/mcp/requestDeduper'
import { DomainError } from '../../src/main/services/domainError'

const now = '2026-08-27T00:00:00.000Z'

function fixtures() {
  let transcriptionCreates = 0
  let documentCreates = 0
  const operations = {
    listRecordings: async () => ({
      items: [{ id: 'rec-1', title: '录音_20260827.wav', duration: 3, size: 1200, created_at: now, transcription_available: false }],
    }),
    createTranscriptionFromRecording: async (recordingId: string, modelId?: string) => {
      if (recordingId !== 'rec-1') throw new DomainError('NOT_FOUND', '录音不存在')
      if (modelId === 'missing-model') throw new DomainError('UNAVAILABLE', '模型不可用')
      return ({
      id: `task-${++transcriptionCreates}`, fileName: '录音_20260827.wav', filePath: '/private/recording.wav', fileId: null,
      fileSize: 1200, duration: 3, status: 'pending' as const, modelType: modelId || 'sensevoice-small', strategy: null,
      error: null, createdAt: now, completedAt: null, processingTime: null, wordCount: null,
      source: 'recording' as const, sourceId: 'rec-1',
    }) },
    createTranscriptionFromFile: async ({ filePath }: { filePath: string }) => {
      if (!filePath.startsWith('/')) throw new DomainError('INVALID_ARGUMENT', '必须是绝对路径')
      return ({
      id: `task-${++transcriptionCreates}`, fileName: 'audio.wav', filePath: '/private/audio.wav', fileId: null,
      fileSize: 1200, duration: 3, status: 'pending' as const, modelType: 'sensevoice-small', strategy: null,
      error: null, createdAt: now, completedAt: null, processingTime: null, wordCount: null,
      source: 'upload' as const, sourceId: null,
    }) },
    listTranscriptions: async () => ({ items: [{
      task_id: 'task-1', file_name: 'audio.wav', status: 'completed' as const, duration: 3,
      word_count: 2, model: 'sensevoice-small', created_at: now, completed_at: now,
    }] }),
    getTranscriptionContent: async ({ taskId, includeSegments }: { taskId: string; includeSegments?: boolean }) => ({
      task_id: taskId, file_name: 'audio.wav', status: 'completed' as const, duration: 3,
      word_count: 2, model: 'sensevoice-small', created_at: now, completed_at: now,
      text: '测试', truncated: false,
      ...(includeSegments ? { segments: [{ text: '测试', start: 0, end: 1 }] } : {}),
    }),
    listTemplates: async () => ({
      items: [{ id: 'tpl-meeting', name: '会议纪要', prompt: '整理内容', builtin: true, updated_at: now }],
    }),
    createDocumentFromTranscriptions: async ({ transcriptionIds, templateId }: { transcriptionIds: string[]; templateId: string }) => {
      if (templateId !== 'tpl-meeting') throw new DomainError('NOT_FOUND', '模板不存在')
      if (transcriptionIds.includes('pending-task')) throw new DomainError('NOT_READY', '任务未完成')
      return ({
      id: `doc-${++documentCreates}`, title: '会议纪要', content: '', status: 'generating' as const,
      templateId: 'tpl-meeting', sourceIds: '[{"type":"task","id":"task-1"}]', error: null,
      createdAt: now, updatedAt: now,
    }) },
    listDocuments: async () => ({ items: [{
      document_id: 'doc-1', title: '会议纪要', status: 'completed' as const, template_id: 'tpl-meeting',
      source_transcription_ids: ['task-1'], created_at: now, updated_at: now,
    }] }),
    getDocumentContent: async ({ documentId }: { documentId: string }) => ({
      document_id: documentId, title: '会议纪要', status: 'completed' as const, template_id: 'tpl-meeting',
      source_transcription_ids: ['task-1'], created_at: now, updated_at: now,
      format: 'text' as const, content: '整理结果', truncated: false,
    }),
  } as unknown as McpOperations
  return { operations, counts: () => ({ transcriptionCreates, documentCreates }) }
}

test('server advertises exactly the safe nine tools in stable order', async () => {
  const { operations } = fixtures()
  const server = createIRecordMcpServer('test-secret', new RequestDeduper(), operations)
  const client = new Client({ name: 'irecord-test', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  try {
    const listed = await client.listTools()
    assert.deepEqual(listed.tools.map(tool => tool.name), [...IRECORD_MCP_TOOL_NAMES])
    const forbidden = listed.tools.filter(tool => /(delete|setting|credential|export|record_microphone|sql|model_download)/i.test(tool.name))
    assert.deepEqual(forbidden, [])
    await assert.rejects(client.callTool({ name: 'irecord_delete_recording', arguments: {} }))
  } finally {
    await client.close()
    await server.close()
  }
})

test('tools return structured content and creation retries are idempotent', async () => {
  const { operations, counts } = fixtures()
  const server = createIRecordMcpServer('test-secret', new RequestDeduper(), operations)
  const client = new Client({ name: 'irecord-test', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  try {
    const recordings = await client.callTool({ name: 'irecord_list_recordings', arguments: {} })
    assert.equal(recordings.isError, undefined)
    assert.equal((recordings.structuredContent as any).items[0].id, 'rec-1')
    assert.equal(recordings.content[0]?.type, 'text')

    const explicitFile = await client.callTool({
      name: 'irecord_transcribe_file',
      arguments: { file_path: '/tmp/audio.wav', request_id: 'file-request-1' },
    })
    assert.equal((explicitFile.structuredContent as any).status, 'pending')

    const transcriptions = await client.callTool({ name: 'irecord_list_transcriptions', arguments: { status: 'completed' } })
    assert.equal((transcriptions.structuredContent as any).items[0].task_id, 'task-1')
    const transcription = await client.callTool({
      name: 'irecord_get_transcription', arguments: { task_id: 'task-1', include_segments: true },
    })
    assert.equal((transcription.structuredContent as any).segments.length, 1)

    const templates = await client.callTool({ name: 'irecord_list_templates', arguments: { builtin: true } })
    assert.equal((templates.structuredContent as any).items[0].id, 'tpl-meeting')

    const args = { recording_id: 'rec-1', request_id: 'retry-1' }
    const first = await client.callTool({ name: 'irecord_transcribe_recording', arguments: args })
    const retry = await client.callTool({ name: 'irecord_transcribe_recording', arguments: args })
    assert.deepEqual(retry.structuredContent, first.structuredContent)
    assert.equal(counts().transcriptionCreates, 2)

    const conflict = await client.callTool({
      name: 'irecord_transcribe_recording',
      arguments: { recording_id: 'rec-2', request_id: 'retry-1' },
    })
    assert.equal(conflict.isError, true)

    const document = await client.callTool({
      name: 'irecord_create_document',
      arguments: { transcription_ids: ['task-1'], template_id: 'tpl-meeting', request_id: 'doc-request-1' },
    })
    assert.equal((document.structuredContent as any).status, 'generating')
    assert.equal(counts().documentCreates, 1)

    const documents = await client.callTool({ name: 'irecord_list_documents', arguments: { status: 'completed' } })
    assert.equal((documents.structuredContent as any).items[0].document_id, 'doc-1')
    const readDocument = await client.callTool({ name: 'irecord_get_document', arguments: { document_id: 'doc-1', format: 'text' } })
    assert.equal((readDocument.structuredContent as any).content, '整理结果')

    const invalidModel = await client.callTool({
      name: 'irecord_transcribe_recording', arguments: { recording_id: 'rec-1', model_id: 'missing-model' },
    })
    assert.equal(invalidModel.isError, true)
    const invalidTemplate = await client.callTool({
      name: 'irecord_create_document', arguments: { transcription_ids: ['task-1'], template_id: 'missing-template' },
    })
    assert.equal(invalidTemplate.isError, true)
    const incompleteSource = await client.callTool({
      name: 'irecord_create_document', arguments: { transcription_ids: ['pending-task'], template_id: 'tpl-meeting' },
    })
    assert.equal(incompleteSource.isError, true)
    const excessivePage = await client.callTool({ name: 'irecord_list_recordings', arguments: { limit: 101 } })
    assert.equal(excessivePage.isError, true)
    const excessiveChunk = await client.callTool({ name: 'irecord_get_document', arguments: { document_id: 'doc-1', max_chars: 50_001 } })
    assert.equal(excessiveChunk.isError, true)
  } finally {
    await client.close()
    await server.close()
  }
})
