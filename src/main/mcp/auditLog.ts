import { app } from 'electron'
import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export interface McpAuditEvent {
  route?: string
  tool?: string
  method?: string
  client?: string
  durationMs: number
  outcome: 'success' | 'error'
  status: number
}

export async function writeMcpAudit(event: McpAuditEvent): Promise<void> {
  try {
    const directory = join(app.getPath('userData'), 'logs')
    await mkdir(directory, { recursive: true })
    const record = {
      timestamp: new Date().toISOString(),
      ...(event.route ? { route: event.route.slice(0, 80) } : {}),
      ...(event.client ? { client: event.client.slice(0, 120) } : {}),
      ...(event.method ? { method: event.method.slice(0, 80) } : {}),
      ...(event.tool ? { tool: event.tool.slice(0, 120) } : {}),
      duration_ms: event.durationMs,
      outcome: event.outcome,
      status: event.status,
    }
    await appendFile(join(directory, 'mcp-audit.log'), `${JSON.stringify(record)}\n`, 'utf8')
  } catch {
    // Audit I/O must not break tool execution.
  }
}
