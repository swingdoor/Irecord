import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RollingRateLimiter,
  pathToken,
  redactedPath,
  validHost,
  validOrigin,
} from '../../src/main/mcp/httpSecurity'
import { RequestDeduper } from '../../src/main/mcp/requestDeduper'
import { generateMcpToken, verifyMcpToken } from '../../src/main/mcp/accessToken'
import { DomainError } from '../../src/main/services/domainError'
import { chunkText, paginate } from '../../src/main/services/pagination'

test('HTTP guards accept only loopback endpoint metadata', () => {
  assert.equal(validHost('127.0.0.1:17631', 17631), true)
  assert.equal(validHost('localhost:17631', 17631), true)
  assert.equal(validHost('localhost:9999', 17631), false)
  assert.equal(validHost('evil.example:17631', 17631), false)
  assert.equal(validOrigin(undefined), true)
  assert.equal(validOrigin('http://127.0.0.1:3000'), true)
  assert.equal(validOrigin('https://localhost'), true)
  assert.equal(validOrigin('https://evil.example'), false)
})

test('token is accepted only from the connection path and redacted from logs', () => {
  assert.equal(pathToken('/mcp/abc_123'), 'abc_123')
  assert.equal(pathToken('/mcp?token=abc_123'), undefined)
  assert.equal(redactedPath('/mcp/abc_123'), '/mcp/***')
})

test('new connection tokens contain 128 bits and compare safely', () => {
  const token = generateMcpToken()
  assert.equal(token.length, 22)
  assert.equal(Buffer.from(token, 'base64url').length, 16)
  assert.equal(verifyMcpToken(token, token), true)
  assert.equal(verifyMcpToken(token, generateMcpToken()), false)
  assert.equal(verifyMcpToken(token, 'short'), false)
})

test('rolling limiter rejects the 121st request in one minute', () => {
  const limiter = new RollingRateLimiter(120, 60_000)
  for (let index = 0; index < 120; index++) assert.equal(limiter.accept('scope', 10_000), true)
  assert.equal(limiter.accept('scope', 10_000), false)
  assert.equal(limiter.accept('scope', 70_001), true)
})

test('request id retries deduplicate identical arguments and reject conflicts', async () => {
  const deduper = new RequestDeduper()
  let calls = 0
  const action = async () => ({ id: ++calls })
  const first = await deduper.execute('secret', 'tool', 'request-1', { value: 1 }, action)
  const retry = await deduper.execute('secret', 'tool', 'request-1', { value: 1 }, action)
  assert.deepEqual(retry, first)
  assert.equal(calls, 1)
  await assert.rejects(
    deduper.execute('secret', 'tool', 'request-1', { value: 2 }, action),
    (error: unknown) => error instanceof DomainError && error.code === 'CONFLICT',
  )
})

test('pagination and content chunks enforce bounds and cursor scope', () => {
  const values = Array.from({ length: 25 }, (_, index) => index)
  const first = paginate(values, { scope: 'items', filters: { query: '' } })
  assert.equal(first.items.length, 20)
  assert.ok(first.nextCursor)
  const second = paginate(values, { scope: 'items', filters: { query: '' }, cursor: first.nextCursor })
  assert.deepEqual(second.items, [20, 21, 22, 23, 24])
  assert.throws(() => paginate(values, { scope: 'items', filters: {}, limit: 101 }), DomainError)
  assert.throws(() => paginate(values, { scope: 'other', filters: { query: '' }, cursor: first.nextCursor }), DomainError)

  const chunk = chunkText('a'.repeat(13_000), { scope: 'text' })
  assert.equal(chunk.text.length, 12_000)
  assert.equal(chunk.truncated, true)
  assert.ok(chunk.nextCursor)
  assert.throws(() => chunkText('text', { scope: 'text', maxChars: 50_001 }), DomainError)
})
