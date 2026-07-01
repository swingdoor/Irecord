/**
 * Sherpa-ONNX CLI 端到端测试。
 * 运行: node scripts/test-e2e.js /path/to/audio.wav
 */
const path = require('path')
const fs = require('fs')
const { spawnSync } = require('child_process')

const wavPath = process.argv[2]
if (!wavPath || !fs.existsSync(wavPath)) {
  console.error('Usage: node scripts/test-e2e.js /path/to/audio.wav')
  process.exit(1)
}

const platformKey = `${process.platform}-${process.arch}`
const exe = process.platform === 'win32' ? '.exe' : ''
const offline = path.join(__dirname, '..', 'resources', 'runtimes', 'sherpa-onnx', platformKey, `sherpa-onnx-offline${exe}`)
const modelDir = path.join(__dirname, '..', 'resources', 'models', 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17')

const args = [
  `--tokens=${path.join(modelDir, 'tokens.txt')}`,
  `--sense-voice-model=${path.join(modelDir, 'model.int8.onnx')}`,
  '--sense-voice-language=auto',
  '--sense-voice-use-itn=true',
  '--provider=cpu',
  '--num-threads=4',
  wavPath,
]

console.log('=== SenseVoice CLI E2E ===\n')
console.log([offline, ...args].join(' '))
const startedAt = Date.now()
const result = spawnSync(offline, args, { encoding: 'utf-8' })
const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)

if (result.status !== 0) {
  console.error(result.stderr || result.stdout)
  process.exit(result.status || 1)
}

const jsonLine = result.stdout.split('\n').map((line) => line.trim()).find((line) => line.startsWith('{') && line.endsWith('}'))
console.log(`耗时: ${elapsed}s`)
console.log(jsonLine || result.stdout)
