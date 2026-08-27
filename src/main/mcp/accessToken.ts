import { app } from 'electron'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export function generateMcpToken(): string {
  return randomBytes(16).toString('base64url')
}

export function verifyMcpToken(token: string | null, candidate: string): boolean {
  if (!token) return false
  const expected = Buffer.from(token)
  const actual = Buffer.from(candidate)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export class McpTokenStore {
  private token: string | null = null

  private get filePath(): string {
    return join(app.getPath('userData'), 'mcp-token')
  }

  getOrCreate(): string {
    if (this.token) return this.token
    if (existsSync(this.filePath)) {
      const stored = readFileSync(this.filePath, 'utf8').trim()
      const byteLength = Buffer.from(stored, 'base64url').length
      const validLength = (stored.length === 22 && byteLength === 16) || (stored.length === 43 && byteLength === 32)
      if (/^[A-Za-z0-9_-]+$/.test(stored) && validLength) {
        this.token = stored
        return stored
      }
    }
    return this.refresh()
  }

  refresh(): string {
    const generated = generateMcpToken()
    writeFileSync(this.filePath, generated, { encoding: 'utf8', mode: 0o600 })
    this.token = generated
    return generated
  }
}
