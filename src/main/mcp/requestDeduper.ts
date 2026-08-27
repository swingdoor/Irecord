import { createHash } from 'node:crypto'
import { DomainError } from '../services/domainError'

interface Entry<T> {
  argsHash: string
  result: T
  expiresAt: number
}

const TTL_MS = 10 * 60 * 1000

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>
    return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export class RequestDeduper {
  private readonly entries = new Map<string, Entry<unknown>>()

  async execute<T>(scope: string, tool: string, requestId: string | undefined, args: unknown, action: () => Promise<T>): Promise<T> {
    if (!requestId) return action()
    if (requestId.length > 128) throw new DomainError('INVALID_ARGUMENT', 'request_id 不能超过 128 个字符')
    this.cleanup()
    const key = `${scope}:${tool}:${requestId}`
    const argsHash = createHash('sha256').update(stableJson(args)).digest('hex')
    const existing = this.entries.get(key) as Entry<T> | undefined
    if (existing) {
      if (existing.argsHash !== argsHash) {
        throw new DomainError('CONFLICT', '相同 request_id 已用于不同参数，请使用新的 request_id')
      }
      return existing.result
    }
    const result = await action()
    this.entries.set(key, { argsHash, result, expiresAt: Date.now() + TTL_MS })
    return result
  }

  clear(): void {
    this.entries.clear()
  }

  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key)
    }
  }
}
