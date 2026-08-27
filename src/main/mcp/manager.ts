import { createMcpHandler, type McpHttpHandler } from '@modelcontextprotocol/server'
import { toNodeHandler, type NodeMcpRequestHandler } from '@modelcontextprotocol/node'
import { createHash } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { getSettings, updateSettings } from '../utils/settings'
import { DEFAULT_MCP_PORT, type McpRuntimeStatus } from './contracts'
import { McpTokenStore, verifyMcpToken } from './accessToken'
import { RequestDeduper } from './requestDeduper'
import {
  BodyTooLargeError,
  InvalidJsonError,
  RollingRateLimiter,
  pathToken,
  readJsonBody,
  sendHttpError,
  redactedPath,
  validHost,
  validOrigin,
} from './httpSecurity'
import { createIRecordMcpServer } from './tools'
import { writeMcpAudit } from './auditLog'

function validatePort(port: number): number {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('端口必须是 1024-65535 的整数')
  }
  return port
}

function requestMetadata(body: unknown, req: IncomingMessage): { method?: string; tool?: string; client?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { client: req.headers['user-agent']?.slice(0, 120) }
  }
  const message = body as Record<string, any>
  const method = typeof message.method === 'string' ? message.method : undefined
  const tool = method === 'tools/call' && typeof message.params?.name === 'string' ? message.params.name : undefined
  const initializedClient = method === 'initialize' && typeof message.params?.clientInfo?.name === 'string'
    ? `${message.params.clientInfo.name}${message.params.clientInfo.version ? `/${message.params.clientInfo.version}` : ''}`
    : undefined
  const headerClient = typeof req.headers['mcp-client-name'] === 'string' ? req.headers['mcp-client-name'] : undefined
  return { method, tool, client: (initializedClient || headerClient || req.headers['user-agent'])?.slice(0, 120) }
}

export class McpManager {
  private readonly deduper = new RequestDeduper()
  private readonly limiter = new RollingRateLimiter()
  private readonly tokenStore = new McpTokenStore()
  private token: string | null = null
  private httpServer: Server | null = null
  private mcpHandler: McpHttpHandler | null = null
  private nodeHandler: NodeMcpRequestHandler | null = null
  private state: McpRuntimeStatus['state'] = 'stopped'
  private boundPort: number | undefined
  private lastError: string | undefined

  constructor(private readonly port = DEFAULT_MCP_PORT) {}

  async initialize(): Promise<void> {
    if (getSettings().mcpEnabled === true) await this.start()
  }

  getStatus(): McpRuntimeStatus {
    const settings = getSettings()
    return {
      state: this.state,
      enabled: settings.mcpEnabled === true,
      ...(this.lastError ? { lastError: this.lastError } : {}),
    }
  }

  async configure(enabled: boolean): Promise<McpRuntimeStatus> {
    updateSettings({ mcpEnabled: enabled })
    if (!enabled) {
      await this.stop()
    } else if (this.state !== 'running') {
      await this.start()
    }
    return this.getStatus()
  }

  async start(): Promise<void> {
    if (this.state === 'running' || this.state === 'starting') return
    const port = validatePort(this.port)
    this.state = 'starting'
    this.lastError = undefined
    try {
      this.token = this.tokenStore.getOrCreate()
    } catch (error) {
      this.state = 'error'
      this.lastError = error instanceof Error ? error.message : '无法保存 MCP token'
      return
    }
    this.deduper.clear()
    this.limiter.clear()

    this.mcpHandler = createMcpHandler(
      () => createIRecordMcpServer(this.token!, this.deduper),
      {
        legacy: 'stateless',
        onerror: error => {
          console.error('[MCP] Protocol error:', error.name)
        },
      },
    )
    this.nodeHandler = toNodeHandler(this.mcpHandler)
    const server = createServer((req, res) => {
      void this.handleRequest(req, res)
    })
    this.httpServer = server

    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => reject(error)
        server.once('error', onError)
        server.listen(port, '127.0.0.1', () => {
          server.off('error', onError)
          resolve()
        })
      })
      this.boundPort = port
      this.state = 'running'
    } catch (error) {
      this.state = 'error'
      this.boundPort = undefined
      this.lastError = error instanceof Error ? error.message : '无法启动 MCP 服务'
      this.httpServer = null
      await this.mcpHandler.close().catch(() => {})
      this.mcpHandler = null
      this.nodeHandler = null
      this.token = null
    }
  }

  async stop(): Promise<void> {
    const server = this.httpServer
    this.httpServer = null
    if (server) {
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
    if (this.mcpHandler) await this.mcpHandler.close().catch(() => {})
    this.mcpHandler = null
    this.nodeHandler = null
    this.token = null
    this.deduper.clear()
    this.limiter.clear()
    this.boundPort = undefined
    this.lastError = undefined
    this.state = 'stopped'
  }

  getConnectionUrl(): string {
    if (this.state !== 'running' || !this.boundPort || !this.token) {
      throw new Error('MCP 服务未运行，无法获取连接地址')
    }
    return `http://127.0.0.1:${this.boundPort}/mcp/${this.token}`
  }

  refreshConnectionUrl(): string {
    if (this.state !== 'running') throw new Error('MCP 服务未运行，无法刷新连接地址')
    this.token = this.tokenStore.refresh()
    this.deduper.clear()
    this.limiter.clear()
    return this.getConnectionUrl()
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const startedAt = Date.now()
    const port = this.boundPort
    if (!port || !this.nodeHandler) {
      sendHttpError(res, 503, 'MCP service is not ready')
      return
    }

    let pathname = ''
    try {
      pathname = new URL(req.url || '/', `http://127.0.0.1:${port}`).pathname
    } catch {
      sendHttpError(res, 400, 'Invalid request URL')
      return
    }
    const candidate = pathToken(pathname)
    if (!candidate) {
      sendHttpError(res, 404, 'Not found')
      return
    }
    if (!validHost(req.headers.host, port) || !validOrigin(req.headers.origin)) {
      sendHttpError(res, 403, 'Forbidden')
      return
    }

    if (!verifyMcpToken(this.token, candidate)) {
      sendHttpError(res, 401, 'Unauthorized')
      return
    }
    const secretScope = createHash('sha256').update(candidate).digest('hex')
    if (!this.limiter.accept(secretScope)) {
      sendHttpError(res, 429, 'Rate limit exceeded')
      return
    }

    let body: unknown
    try {
      if (req.method === 'POST') body = await readJsonBody(req)
    } catch (error) {
      if (error instanceof BodyTooLargeError) sendHttpError(res, 413, 'Request body exceeds 1 MiB')
      else if (error instanceof InvalidJsonError) sendHttpError(res, 400, 'Invalid JSON body')
      else sendHttpError(res, 400, 'Invalid request body')
      return
    }

    const metadata = requestMetadata(body, req)
    req.url = '/mcp'
    try {
      await this.nodeHandler(req, res, body)
      void writeMcpAudit({
        ...metadata,
        route: redactedPath(pathname),
        durationMs: Date.now() - startedAt,
        outcome: res.statusCode >= 400 ? 'error' : 'success',
        status: res.statusCode,
      })
    } catch (error) {
      if (!res.headersSent) sendHttpError(res, 500, 'MCP request failed')
      void writeMcpAudit({
        ...metadata,
        route: redactedPath(pathname),
        durationMs: Date.now() - startedAt,
        outcome: 'error',
        status: res.statusCode || 500,
      })
    }
  }
}

export const mcpManager = new McpManager()
