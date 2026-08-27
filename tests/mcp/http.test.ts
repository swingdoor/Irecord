import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { createIRecordMcpServer, IRECORD_MCP_TOOL_NAMES, type McpOperations } from '../../src/main/mcp/tools'
import { RequestDeduper } from '../../src/main/mcp/requestDeduper'
import {
  pathToken,
  readJsonBody,
  sendHttpError,
  validHost,
  validOrigin,
} from '../../src/main/mcp/httpSecurity'

const secret = 'test_secret_abcdefghijklmnopqrstuvwxyz123456'
const now = '2026-08-27T00:00:00.000Z'
const operations = {
  listRecordings: async () => ({ items: [] }),
  createTranscriptionFromRecording: async () => { throw new Error('not used') },
  createTranscriptionFromFile: async () => { throw new Error('not used') },
  listTranscriptions: async () => ({ items: [] }),
  getTranscriptionContent: async () => { throw new Error('not used') },
  listTemplates: async () => ({ items: [{ id: 'tpl-meeting', name: '会议纪要', prompt: '整理', builtin: true, updated_at: now }] }),
  createDocumentFromTranscriptions: async () => { throw new Error('not used') },
  listDocuments: async () => ({ items: [] }),
  getDocumentContent: async () => { throw new Error('not used') },
} as unknown as McpOperations

test('authenticated stateless Streamable HTTP exposes tools and no legacy SSE route', async () => {
  const deduper = new RequestDeduper()
  const handler = createMcpHandler(
    () => createIRecordMcpServer(secret, deduper, operations),
    { legacy: 'stateless' },
  )
  const nodeHandler = toNodeHandler(handler)
  let activePort = 0
  const server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url || '/', `http://127.0.0.1:${activePort}`)
      const candidate = pathToken(url.pathname)
      if (!candidate) {
        sendHttpError(res, 404, 'Not found')
        return
      }
      if (!validHost(req.headers.host, activePort) || !validOrigin(req.headers.origin)) {
        sendHttpError(res, 403, 'Forbidden')
        return
      }
      if (candidate !== secret) {
        sendHttpError(res, 401, 'Unauthorized')
        return
      }
      const body = req.method === 'POST' ? await readJsonBody(req) : undefined
      req.url = '/mcp'
      await nodeHandler(req, res, body)
    })().catch(() => sendHttpError(res, 500, 'failed'))
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  activePort = address.port
  const base = `http://127.0.0.1:${activePort}`

  try {
    assert.equal((await fetch(`${base}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 404)
    assert.equal((await fetch(`${base}/mcp/wrong`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401)
    assert.equal((await fetch(`${base}/sse`)).status, 404)

    const client = new Client(
      { name: 'irecord-http-test', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } },
    )
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp/${secret}`))
    await client.connect(transport)
    try {
      const listed = await client.listTools()
      assert.deepEqual(listed.tools.map(tool => tool.name), [...IRECORD_MCP_TOOL_NAMES])
      const templates = await client.callTool({ name: 'irecord_list_templates', arguments: {} })
      assert.equal((templates.structuredContent as any).items[0].id, 'tpl-meeting')
      await assert.rejects(client.callTool({ name: 'irecord_delete_document', arguments: {} }))
    } finally {
      await client.close()
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await handler.close()
  }
})
