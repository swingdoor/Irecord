import type { CallToolResult } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { DomainError, domainErrorMessage } from '../services/domainError'

export const listInputFields = {
  query: z.string().max(200).optional().describe('Optional case-insensitive text filter'),
  created_after: z.string().max(64).optional().describe('Optional ISO date/time lower bound'),
  created_before: z.string().max(64).optional().describe('Optional ISO date/time upper bound'),
  cursor: z.string().max(2048).optional().describe('Opaque cursor returned by the previous call'),
  limit: z.number().int().min(1).max(100).optional().describe('Page size; defaults to 20, maximum 100'),
}

export const contentInputFields = {
  cursor: z.string().max(2048).optional().describe('Opaque content cursor returned by the previous call'),
  max_chars: z.number().int().min(1).max(50_000).optional().describe('Maximum characters; defaults to 12000'),
}

export const requestIdField = z.string().min(1).max(128).optional()
  .describe('Optional idempotency key, retained in memory for ten minutes')

export function successfulToolResult(structuredContent: object, summary: string): CallToolResult {
  return {
    content: [{ type: 'text', text: summary }],
    structuredContent: { ...structuredContent },
  }
}

export function failedToolResult(error: unknown, fallback = '操作失败'): CallToolResult {
  const prefix = error instanceof DomainError ? `${error.code}: ` : ''
  return {
    isError: true,
    content: [{ type: 'text', text: `${prefix}${domainErrorMessage(error, fallback)}` }],
  }
}

export async function mapToolResult<T extends object>(
  action: () => Promise<T>,
  summary: (value: T) => string,
): Promise<CallToolResult> {
  try {
    const value = await action()
    return successfulToolResult(value, summary(value))
  } catch (error) {
    return failedToolResult(error)
  }
}
