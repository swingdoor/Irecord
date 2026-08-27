import assert from 'node:assert/strict'
import { app } from 'electron'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDb, createTask, getTask } from '../../src/main/db/database'
import { McpTokenStore } from '../../src/main/mcp/accessToken'
import { McpManager } from '../../src/main/mcp/manager'
import { IRECORD_MCP_TOOL_NAMES } from '../../src/main/mcp/tools'
import { shutdownQueue, startQueue } from '../../src/main/taskQueue'
import { getSettings } from '../../src/main/utils/settings'

async function listenEphemeral() {
  const server = createServer((_req, res) => res.end('occupied'))
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  return { server, port: address.port }
}

async function closeServer(server: ReturnType<typeof createServer>) {
  await new Promise<void>(resolve => server.close(() => resolve()))
}

async function run() {
  const userData = mkdtempSync(join(tmpdir(), 'irecord-mcp-test-'))
  app.setPath('userData', userData)
  await app.whenReady()

  const originalConsoleError = console.error
  console.error = () => {}
  try {
    const headlessTask = await createTask({
      fileName: 'missing.wav',
      filePath: join(userData, 'missing.wav'),
      fileSize: 0,
      duration: 1,
      modelType: 'sensevoice-small',
    })
    startQueue()
    let headlessStatus = (await getTask(headlessTask.id))?.status
    for (let index = 0; index < 100 && (headlessStatus === 'pending' || headlessStatus === 'processing'); index++) {
      await new Promise(resolve => setTimeout(resolve, 50))
      headlessStatus = (await getTask(headlessTask.id))?.status
    }
    assert.equal(headlessStatus, 'failed')
  } finally {
    console.error = originalConsoleError
  }

  const occupied = await listenEphemeral()
  const legacyToken = Buffer.alloc(32, 7).toString('base64url')
  writeFileSync(join(userData, 'mcp-token'), legacyToken, { encoding: 'utf8', mode: 0o600 })
  const manager = new McpManager(occupied.port)
  const failed = await manager.configure(true)
  assert.equal(failed.state, 'error')
  assert.ok(failed.lastError)
  await closeServer(occupied.server)

  const running = await manager.configure(true)
  assert.equal(running.state, 'running')
  const connectionUrl = manager.getConnectionUrl()
  const token = new URL(connectionUrl).pathname.split('/')[2]
  assert.equal(token, legacyToken)
  assert.equal(new McpTokenStore().getOrCreate(), token)

  try {
    assert.equal((await fetch(`http://127.0.0.1:${occupied.port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })).status, 404)
    assert.equal((await fetch(`http://127.0.0.1:${occupied.port}/mcp/wrong`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })).status, 401)
    assert.equal((await fetch(`http://127.0.0.1:${occupied.port}/sse`)).status, 404)
    assert.equal((await fetch(connectionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil.example',
      },
      body: '{}',
    })).status, 403)
    assert.equal((await fetch(connectionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'x'.repeat(1024 * 1024) }),
    })).status, 413)

    const client = new Client(
      { name: 'irecord-electron-smoke', version: '1.0.0' },
      { versionNegotiation: { mode: 'auto' } },
    )
    await client.connect(new StreamableHTTPClientTransport(new URL(connectionUrl)))
    try {
      const tools = await client.listTools()
      assert.deepEqual(tools.tools.map(tool => tool.name), [...IRECORD_MCP_TOOL_NAMES])
      const templates = await client.callTool({ name: 'irecord_list_templates', arguments: {} })
      assert.ok(Array.isArray((templates.structuredContent as any).items))
      const recordings = await client.callTool({ name: 'irecord_list_recordings', arguments: {} })
      assert.deepEqual((recordings.structuredContent as any).items, [])
      const invalidCreation = await client.callTool({
        name: 'irecord_transcribe_file',
        arguments: { file_path: 'relative.wav', request_id: 'invalid-create' },
      })
      assert.equal(invalidCreation.isError, true)
    } finally {
      await client.close()
    }

    const settings = getSettings() as Record<string, unknown>
    assert.equal(settings.mcpEnabled, true)
    assert.equal(Object.keys(settings).some(key => /(secret|token|credential)/i.test(key)), false)

    await new Promise(resolve => setTimeout(resolve, 50))
    const audit = readFileSync(join(userData, 'logs', 'mcp-audit.log'), 'utf8')
    assert.equal(audit.includes(token), false)
    assert.equal(audit.includes('/mcp/***'), true)

    const refreshedUrl = manager.refreshConnectionUrl()
    assert.notEqual(refreshedUrl, connectionUrl)
    const refreshedToken = new URL(refreshedUrl).pathname.split('/')[2]
    assert.equal(refreshedToken.length, 22)
    assert.equal(new McpTokenStore().getOrCreate(), refreshedToken)
    assert.equal((await fetch(connectionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })).status, 401)

    const refreshedClient = new Client({ name: 'irecord-refreshed-token-smoke', version: '1.0.0' })
    await refreshedClient.connect(new StreamableHTTPClientTransport(new URL(refreshedUrl)))
    try {
      assert.equal((await refreshedClient.listTools()).tools.length, 9)
    } finally {
      await refreshedClient.close()
    }

    await manager.configure(false)
    await manager.configure(true)
    assert.equal(manager.getConnectionUrl(), refreshedUrl)
  } finally {
    await manager.configure(false)
    await manager.stop()
    await shutdownQueue()
    closeDb()
    rmSync(userData, { recursive: true, force: true })
    app.quit()
  }
}

run().then(() => {
  console.log('MCP Electron smoke test passed')
}).catch(error => {
  console.error(error)
  process.exitCode = 1
  app.quit()
})
