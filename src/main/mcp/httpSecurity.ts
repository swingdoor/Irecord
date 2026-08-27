import type { IncomingMessage, ServerResponse } from 'node:http'

export const MAX_MCP_BODY_BYTES = 1024 * 1024

export function validHost(host: string | undefined, port: number): boolean {
  if (!host) return false
  return host.toLocaleLowerCase() === `127.0.0.1:${port}` || host.toLocaleLowerCase() === `localhost:${port}`
}

export function validOrigin(origin: string | undefined): boolean {
  if (!origin) return true
  try {
    const parsed = new URL(origin)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
  } catch {
    return false
  }
}

export function pathToken(pathname: string): string | undefined {
  const match = pathname.match(/^\/mcp\/([A-Za-z0-9_-]+)$/)
  return match?.[1]
}

export function redactedPath(pathname: string): string {
  return pathname.replace(/^\/mcp\/[^/]+$/, '/mcp/***')
}

export function sendHttpError(res: ServerResponse, status: number, message: string): void {
  if (res.headersSent) return
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify({ error: message }))
}

export async function readJsonBody(req: IncomingMessage, limit = MAX_MCP_BODY_BYTES): Promise<unknown> {
  const contentLength = Number(req.headers['content-length'] || 0)
  if (Number.isFinite(contentLength) && contentLength > limit) throw new BodyTooLargeError()
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > limit) throw new BodyTooLargeError()
    chunks.push(buffer)
  }
  if (total === 0) return undefined
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new InvalidJsonError()
  }
}

export class BodyTooLargeError extends Error {}
export class InvalidJsonError extends Error {}

export class RollingRateLimiter {
  private readonly accepted = new Map<string, number[]>()

  constructor(private readonly maximum = 120, private readonly windowMs = 60_000) {}

  accept(scope: string, now = Date.now()): boolean {
    const cutoff = now - this.windowMs
    const timestamps = (this.accepted.get(scope) || []).filter(value => value > cutoff)
    if (timestamps.length >= this.maximum) {
      this.accepted.set(scope, timestamps)
      return false
    }
    timestamps.push(now)
    this.accepted.set(scope, timestamps)
    return true
  }

  clear(): void {
    this.accepted.clear()
  }
}
