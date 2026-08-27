import { McpServer } from '@modelcontextprotocol/server'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  createDocumentFromTranscriptions,
  createTranscriptionFromFile,
  createTranscriptionFromRecording,
  getDocumentContent,
  getTranscriptionContent,
  listDocuments,
  listRecordings,
  listTemplates,
  listTranscriptions,
} from '../services/applicationService'
import { RequestDeduper } from './requestDeduper'
import { contentInputFields, listInputFields, mapToolResult, requestIdField } from './schema'

export interface McpOperations {
  listRecordings: typeof listRecordings
  createTranscriptionFromRecording: typeof createTranscriptionFromRecording
  createTranscriptionFromFile: typeof createTranscriptionFromFile
  listTranscriptions: typeof listTranscriptions
  getTranscriptionContent: typeof getTranscriptionContent
  listTemplates: typeof listTemplates
  createDocumentFromTranscriptions: typeof createDocumentFromTranscriptions
  listDocuments: typeof listDocuments
  getDocumentContent: typeof getDocumentContent
}

const defaultOperations: McpOperations = {
  listRecordings,
  createTranscriptionFromRecording,
  createTranscriptionFromFile,
  listTranscriptions,
  getTranscriptionContent,
  listTemplates,
  createDocumentFromTranscriptions,
  listDocuments,
  getDocumentContent,
}

export const IRECORD_MCP_TOOL_NAMES = [
  'irecord_list_recordings',
  'irecord_transcribe_recording',
  'irecord_transcribe_file',
  'irecord_list_transcriptions',
  'irecord_get_transcription',
  'irecord_list_templates',
  'irecord_create_document',
  'irecord_list_documents',
  'irecord_get_document',
] as const

const taskStatus = z.enum(['pending', 'processing', 'completed', 'failed', 'stopped', 'pending_analysis', 'recording'])
const documentStatus = z.enum(['generating', 'completed', 'failed'])

const pageCursor = { next_cursor: z.string().optional() }
const recordingSchema = z.object({
  id: z.string(), title: z.string(), duration: z.number(), size: z.number(),
  created_at: z.string(), transcription_available: z.boolean(),
})
const transcriptionSchema = z.object({
  task_id: z.string(), file_name: z.string(), status: taskStatus, duration: z.number(),
  word_count: z.number().nullable(), model: z.string(), created_at: z.string(),
  completed_at: z.string().nullable(), error: z.string().optional(),
})
const segmentSchema = z.object({
  text: z.string(), start: z.number(), end: z.number(), speaker: z.string().optional(),
})
const templateSchema = z.object({
  id: z.string(), name: z.string(), prompt: z.string(), builtin: z.boolean(), updated_at: z.string(),
})
const documentSchema = z.object({
  document_id: z.string(), title: z.string(), status: documentStatus, template_id: z.string(),
  source_transcription_ids: z.array(z.string()), error: z.string().optional(),
  created_at: z.string(), updated_at: z.string(),
})

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
const createsWork = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }

function scopeForSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex').slice(0, 24)
}

export function createIRecordMcpServer(
  secret: string,
  deduper: RequestDeduper,
  operations: McpOperations = defaultOperations,
): McpServer {
  const scope = scopeForSecret(secret)
  const server = new McpServer(
    { name: 'irecord-local', version: '0.9.5' },
    {
      instructions: 'Use creation tools to start asynchronous work, then poll the corresponding get tool with the returned ID. This server is local to the running iRecord desktop application.',
      cacheHints: { 'tools/list': { ttlMs: 0, cacheScope: 'private' } },
    },
  )

  server.registerTool(
    IRECORD_MCP_TOOL_NAMES[0],
    {
      title: 'List saved recordings',
      description: 'List saved iRecord recording metadata. Audio bytes and managed local paths are never returned.',
      inputSchema: z.object(listInputFields).strict(),
      outputSchema: z.object({ items: z.array(recordingSchema), ...pageCursor }),
      annotations: readOnly,
    },
    args => mapToolResult(
      async () => {
        const page = await operations.listRecordings(args)
        return { items: page.items, ...(page.nextCursor ? { next_cursor: page.nextCursor } : {}) }
      },
      value => `返回 ${value.items.length} 条录音${value.next_cursor ? '，还有下一页' : ''}`,
    ),
  )

  server.registerTool(
    IRECORD_MCP_TOOL_NAMES[1],
    {
      title: 'Transcribe a saved recording',
      description: 'Queue one saved recording for transcription and return immediately. This creates work; poll irecord_get_transcription.',
      inputSchema: z.object({ recording_id: z.string().min(1), model_id: z.string().min(1).optional(), request_id: requestIdField }).strict(),
      outputSchema: z.object({ task_id: z.string(), status: taskStatus }),
      annotations: createsWork,
    },
    args => mapToolResult(
      () => deduper.execute(scope, IRECORD_MCP_TOOL_NAMES[1], args.request_id, { recording_id: args.recording_id, model_id: args.model_id }, async () => {
        const task = await operations.createTranscriptionFromRecording(args.recording_id, args.model_id)
        return { task_id: task.id, status: task.status }
      }),
      value => `已创建转写任务 ${value.task_id}，当前状态 ${value.status}`,
    ),
  )

  server.registerTool(
    IRECORD_MCP_TOOL_NAMES[2],
    {
      title: 'Transcribe a local media file',
      description: 'Queue one explicit absolute local media-file path. URLs, directories, globs, relative paths and unsupported files are rejected.',
      inputSchema: z.object({ file_path: z.string().min(1), model_id: z.string().min(1).optional(), request_id: requestIdField }).strict(),
      outputSchema: z.object({ task_id: z.string(), status: taskStatus }),
      annotations: createsWork,
    },
    args => mapToolResult(
      () => deduper.execute(scope, IRECORD_MCP_TOOL_NAMES[2], args.request_id, { file_path: args.file_path, model_id: args.model_id }, async () => {
        const task = await operations.createTranscriptionFromFile({ filePath: args.file_path, modelId: args.model_id })
        return { task_id: task.id, status: task.status }
      }),
      value => `已创建转写任务 ${value.task_id}，当前状态 ${value.status}`,
    ),
  )

  server.registerTool(
    IRECORD_MCP_TOOL_NAMES[3],
    {
      title: 'List transcription tasks',
      description: 'List bounded transcription task metadata with status, text and date filters.',
      inputSchema: z.object({ ...listInputFields, status: taskStatus.optional() }).strict(),
      outputSchema: z.object({ items: z.array(transcriptionSchema), ...pageCursor }),
      annotations: readOnly,
    },
    args => mapToolResult(
      async () => {
        const page = await operations.listTranscriptions(args)
        return { items: page.items, ...(page.nextCursor ? { next_cursor: page.nextCursor } : {}) }
      },
      value => `返回 ${value.items.length} 个转写任务${value.next_cursor ? '，还有下一页' : ''}`,
    ),
  )

  server.registerTool(
    IRECORD_MCP_TOOL_NAMES[4],
    {
      title: 'Get transcription status or content',
      description: 'Poll a task. Completed text is returned in bounded chunks; timestamped segments are opt-in.',
      inputSchema: z.object({
        task_id: z.string().min(1), ...contentInputFields,
        include_segments: z.boolean().optional().default(false),
      }).strict(),
      outputSchema: transcriptionSchema.extend({
        text: z.string().optional(), truncated: z.boolean().optional(), next_cursor: z.string().optional(),
        segments: z.array(segmentSchema).optional(),
      }),
      annotations: readOnly,
    },
    args => mapToolResult(
      () => operations.getTranscriptionContent({
        taskId: args.task_id, cursor: args.cursor, maxChars: args.max_chars,
        includeSegments: args.include_segments,
      }),
      value => value.status === 'completed'
        ? `转写 ${value.task_id} 已完成，返回当前文本分块${'next_cursor' in value && value.next_cursor ? '，还有后续内容' : ''}`
        : `转写 ${value.task_id} 当前状态 ${value.status}`,
    ),
  )

  server.registerTool(
    IRECORD_MCP_TOOL_NAMES[5],
    {
      title: 'List knowledge templates',
      description: 'List built-in or user knowledge-document templates and their prompts.',
      inputSchema: z.object({
        query: listInputFields.query, cursor: listInputFields.cursor, limit: listInputFields.limit,
        builtin: z.boolean().optional(),
      }).strict(),
      outputSchema: z.object({ items: z.array(templateSchema), ...pageCursor }),
      annotations: readOnly,
    },
    args => mapToolResult(
      async () => {
        const page = await operations.listTemplates(args)
        return { items: page.items, ...(page.nextCursor ? { next_cursor: page.nextCursor } : {}) }
      },
      value => `返回 ${value.items.length} 个知识模板${value.next_cursor ? '，还有下一页' : ''}`,
    ),
  )

  server.registerTool(
    IRECORD_MCP_TOOL_NAMES[6],
    {
      title: 'Create a knowledge document',
      description: 'Start asynchronous knowledge-document generation from 1-20 completed transcriptions and one template. Poll irecord_get_document.',
      inputSchema: z.object({
        transcription_ids: z.array(z.string().min(1)).min(1).max(20),
        template_id: z.string().min(1), request_id: requestIdField,
      }).strict(),
      outputSchema: z.object({ document_id: z.string(), status: documentStatus }),
      annotations: createsWork,
    },
    args => mapToolResult(
      () => deduper.execute(scope, IRECORD_MCP_TOOL_NAMES[6], args.request_id, {
        transcription_ids: args.transcription_ids, template_id: args.template_id,
      }, async () => {
        const doc = await operations.createDocumentFromTranscriptions({
          transcriptionIds: args.transcription_ids,
          templateId: args.template_id,
        })
        return { document_id: doc.id, status: doc.status }
      }),
      value => `已创建知识文档 ${value.document_id}，当前状态 ${value.status}`,
    ),
  )

  server.registerTool(
    IRECORD_MCP_TOOL_NAMES[7],
    {
      title: 'List knowledge documents',
      description: 'List bounded knowledge-document metadata without full content.',
      inputSchema: z.object({ ...listInputFields, status: documentStatus.optional() }).strict(),
      outputSchema: z.object({ items: z.array(documentSchema), ...pageCursor }),
      annotations: readOnly,
    },
    args => mapToolResult(
      async () => {
        const page = await operations.listDocuments(args)
        return { items: page.items, ...(page.nextCursor ? { next_cursor: page.nextCursor } : {}) }
      },
      value => `返回 ${value.items.length} 个知识文档${value.next_cursor ? '，还有下一页' : ''}`,
    ),
  )

  server.registerTool(
    IRECORD_MCP_TOOL_NAMES[8],
    {
      title: 'Get knowledge document status or content',
      description: 'Poll a document. Completed content is returned as bounded plain-text or HTML chunks.',
      inputSchema: z.object({
        document_id: z.string().min(1), format: z.enum(['text', 'html']).optional().default('text'),
        ...contentInputFields,
      }).strict(),
      outputSchema: documentSchema.extend({
        format: z.enum(['text', 'html']).optional(), content: z.string().optional(),
        truncated: z.boolean().optional(), next_cursor: z.string().optional(),
        html_chunks_require_concatenation: z.boolean().optional(),
      }),
      annotations: readOnly,
    },
    args => mapToolResult(
      () => operations.getDocumentContent({
        documentId: args.document_id, format: args.format,
        cursor: args.cursor, maxChars: args.max_chars,
      }),
      value => value.status === 'completed'
        ? `知识文档 ${value.document_id} 已完成，返回当前内容分块${'next_cursor' in value && value.next_cursor ? '，还有后续内容' : ''}`
        : `知识文档 ${value.document_id} 当前状态 ${value.status}`,
    ),
  )

  return server
}
