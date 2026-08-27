import { createHash } from 'node:crypto'
import { DomainError } from './domainError'

export const DEFAULT_LIST_LIMIT = 20
export const MAX_LIST_LIMIT = 100
export const DEFAULT_CONTENT_CHARS = 12_000
export const MAX_CONTENT_CHARS = 50_000

const CURSOR_TTL_MS = 10 * 60 * 1000

interface CursorPayload {
  version: 1
  scope: string
  offset: number
  fingerprint: string
  expiresAt: number
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('base64url').slice(0, 16)
}

function encode(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

function decode(cursor: string): CursorPayload {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as CursorPayload
    if (
      value.version !== 1 ||
      typeof value.scope !== 'string' ||
      !Number.isSafeInteger(value.offset) ||
      value.offset < 0 ||
      typeof value.fingerprint !== 'string' ||
      !Number.isSafeInteger(value.expiresAt)
    ) {
      throw new Error('invalid cursor')
    }
    if (value.expiresAt < Date.now()) {
      throw new DomainError('INVALID_ARGUMENT', '游标已过期，请从第一页重新请求')
    }
    return value
  } catch (error) {
    if (error instanceof DomainError) throw error
    throw new DomainError('INVALID_ARGUMENT', '游标无效，请从第一页重新请求')
  }
}

export function normalizeListLimit(limit?: number): number {
  const value = limit ?? DEFAULT_LIST_LIMIT
  if (!Number.isInteger(value) || value < 1 || value > MAX_LIST_LIMIT) {
    throw new DomainError('INVALID_ARGUMENT', `limit 必须是 1-${MAX_LIST_LIMIT} 的整数`)
  }
  return value
}

export function normalizeContentLimit(maxChars?: number): number {
  const value = maxChars ?? DEFAULT_CONTENT_CHARS
  if (!Number.isInteger(value) || value < 1 || value > MAX_CONTENT_CHARS) {
    throw new DomainError('INVALID_ARGUMENT', `max_chars 必须是 1-${MAX_CONTENT_CHARS} 的整数`)
  }
  return value
}

export function cursorOffset(scope: string, filters: unknown, cursor?: string): number {
  if (!cursor) return 0
  const payload = decode(cursor)
  if (payload.scope !== scope || payload.fingerprint !== fingerprint(filters)) {
    throw new DomainError('INVALID_ARGUMENT', '游标与当前请求条件不匹配，请从第一页重新请求')
  }
  return payload.offset
}

export function nextCursor(scope: string, filters: unknown, offset: number, hasMore: boolean): string | undefined {
  if (!hasMore) return undefined
  return encode({
    version: 1,
    scope,
    offset,
    fingerprint: fingerprint(filters),
    expiresAt: Date.now() + CURSOR_TTL_MS,
  })
}

export function paginate<T>(items: T[], options: {
  scope: string
  filters: unknown
  cursor?: string
  limit?: number
}): { items: T[]; nextCursor?: string } {
  const limit = normalizeListLimit(options.limit)
  const offset = cursorOffset(options.scope, options.filters, options.cursor)
  if (offset > items.length) {
    throw new DomainError('INVALID_ARGUMENT', '游标位置已失效，请从第一页重新请求')
  }
  const page = items.slice(offset, offset + limit)
  const nextOffset = offset + page.length
  return {
    items: page,
    nextCursor: nextCursor(options.scope, options.filters, nextOffset, nextOffset < items.length),
  }
}

export function chunkText(text: string, options: {
  scope: string
  cursor?: string
  maxChars?: number
}): { text: string; start: number; end: number; truncated: boolean; nextCursor?: string } {
  const maxChars = normalizeContentLimit(options.maxChars)
  const filters = { length: text.length }
  const start = cursorOffset(options.scope, filters, options.cursor)
  if (start > text.length) {
    throw new DomainError('INVALID_ARGUMENT', '内容游标位置已失效，请从头重新请求')
  }
  const end = Math.min(start + maxChars, text.length)
  const truncated = end < text.length
  return {
    text: text.slice(start, end),
    start,
    end,
    truncated,
    nextCursor: nextCursor(options.scope, filters, end, truncated),
  }
}
