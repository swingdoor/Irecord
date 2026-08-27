import assert from 'node:assert/strict'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

const debuggerUrl = process.argv[2]
const mediaPath = process.argv[3]
if (!debuggerUrl) throw new Error('Usage: node scripts/test-packaged-mcp.mjs <page-websocket-debugger-url>')

const socket = new WebSocket(debuggerUrl)
const pending = new Map()
let sequence = 0

socket.addEventListener('message', event => {
  const message = JSON.parse(String(event.data))
  if (!message.id) return
  const waiter = pending.get(message.id)
  if (!waiter) return
  pending.delete(message.id)
  if (message.error) waiter.reject(new Error(message.error.message))
  else waiter.resolve(message.result)
})

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true })
  socket.addEventListener('error', reject, { once: true })
})

function command(method, params = {}) {
  const id = ++sequence
  socket.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

async function evaluate(expression) {
  const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text || 'Renderer evaluation failed')
  return response.result.value
}

await command('Runtime.enable')
const initialStatus = await evaluate('window.electronAPI.getMcpStatus()')
if (initialStatus.status.state !== 'running') {
  const enabled = await evaluate('window.electronAPI.configureMcp({ enabled: true })')
  assert.equal(enabled.status.state, 'running')
}
const first = await evaluate('window.electronAPI.getMcpConnection()')
assert.ok(first.url)
const connectionUrl = first.url

assert.equal((await fetch(new URL('/mcp', connectionUrl), { method: 'POST' })).status, 404)
assert.equal((await fetch(new URL('/mcp/wrong', connectionUrl), { method: 'POST' })).status, 401)
assert.equal((await fetch(new URL('/sse', connectionUrl))).status, 404)

const client = new Client(
  { name: 'irecord-packaged-smoke', version: '1.0.0' },
  { versionNegotiation: { mode: 'auto' } },
)
await client.connect(new StreamableHTTPClientTransport(new URL(connectionUrl)))
try {
  const tools = await client.listTools()
  assert.deepEqual(tools.tools.map(tool => tool.name), [
    'irecord_list_recordings',
    'irecord_transcribe_recording',
    'irecord_transcribe_file',
    'irecord_list_transcriptions',
    'irecord_get_transcription',
    'irecord_list_templates',
    'irecord_create_document',
    'irecord_list_documents',
    'irecord_get_document',
  ])
  const templates = await client.callTool({ name: 'irecord_list_templates', arguments: {} })
  assert.ok((templates.structuredContent?.items || []).length >= 1)
  const creation = await client.callTool({
    name: 'irecord_transcribe_file',
    arguments: { file_path: 'relative-path.wav', request_id: 'packaged-invalid-create' },
  })
  assert.equal(creation.isError, true)
  if (mediaPath) {
    const queued = await client.callTool({
      name: 'irecord_transcribe_file',
      arguments: { file_path: mediaPath, request_id: 'packaged-valid-create' },
    })
    assert.equal(queued.isError, undefined)
    assert.equal(typeof queued.structuredContent?.task_id, 'string')
  }
} finally {
  await client.close()
}

const refreshed = await evaluate('window.electronAPI.refreshMcpConnection()')
assert.ok(refreshed.url)
assert.notEqual(refreshed.url, connectionUrl)
assert.equal((await fetch(connectionUrl, { method: 'POST' })).status, 401)

const disabled = await evaluate('window.electronAPI.configureMcp({ enabled: false })')
assert.equal(disabled.status.state, 'stopped')
await assert.rejects(fetch(connectionUrl))

socket.close()
console.log('Packaged MCP smoke test passed')
