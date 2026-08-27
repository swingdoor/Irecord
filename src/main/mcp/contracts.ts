export const DEFAULT_MCP_PORT = 17631

export type McpRuntimeState = 'stopped' | 'starting' | 'running' | 'error'

export interface McpRuntimeStatus {
  state: McpRuntimeState
  enabled: boolean
  lastError?: string
}

export interface McpSettingsPatch {
  enabled: boolean
}

export interface PageResult<T> {
  items: T[]
  next_cursor?: string
}

export interface ContentChunk {
  content: string
  truncated: boolean
  next_cursor?: string
}
