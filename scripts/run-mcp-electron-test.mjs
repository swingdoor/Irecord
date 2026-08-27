import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import { resolve } from 'node:path'
import electronPath from 'electron'
import { build } from 'esbuild'

const output = resolve('dist/tests/mcp-electron-smoke.cjs')

await build({
  entryPoints: [resolve('tests/mcp/electron-smoke.ts')],
  outfile: output,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  sourcemap: false,
})

const exitCode = await new Promise((resolveExit, reject) => {
  const child = spawn(electronPath, [output], { stdio: 'inherit' })
  child.once('error', reject)
  child.once('exit', code => resolveExit(code ?? 1))
})

rmSync(resolve('dist/tests'), { recursive: true, force: true })
process.exitCode = exitCode
