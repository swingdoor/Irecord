import { ipcMain } from 'electron'
import { mcpManager } from '../mcp/manager'

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'MCP 操作失败'
}

export function registerMcpHandlers(): void {
  ipcMain.handle('mcp-get-status', () => ({ status: mcpManager.getStatus() }))

  ipcMain.handle('mcp-configure', async (_event, params: { enabled: boolean }) => {
    try {
      return { status: await mcpManager.configure(params.enabled) }
    } catch (error) {
      return { status: mcpManager.getStatus(), error: message(error) }
    }
  })

  ipcMain.handle('mcp-get-connection', () => {
    try {
      return { url: mcpManager.getConnectionUrl() }
    } catch (error) {
      return { error: message(error) }
    }
  })

  ipcMain.handle('mcp-refresh-connection', () => {
    try {
      return { url: mcpManager.refreshConnectionUrl() }
    } catch (error) {
      return { error: message(error) }
    }
  })
}
