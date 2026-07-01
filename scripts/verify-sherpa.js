/**
 * 验证 Sherpa-ONNX CLI 运行时和模型文件。
 * 运行: node scripts/verify-sherpa.js
 */
const path = require('path')
const fs = require('fs')
const { spawnSync } = require('child_process')

console.log('=== Sherpa-ONNX CLI 验证 ===\n')

const platformKey = `${process.platform}-${process.arch}`
const runtimeDir = path.join(__dirname, '..', 'resources', 'runtimes', 'sherpa-onnx', platformKey)
const exe = process.platform === 'win32' ? '.exe' : ''
const offline = path.join(runtimeDir, `sherpa-onnx-offline${exe}`)
const diarization = path.join(runtimeDir, `sherpa-onnx-offline-speaker-diarization${exe}`)
const vad = path.join(runtimeDir, `sherpa-onnx-vad${exe}`)

for (const file of [offline, diarization, vad]) {
  if (!fs.existsSync(file)) {
    console.error('[ERROR] 缺少 CLI:', file)
    process.exit(1)
  }
  if (process.platform !== 'win32') {
    try {
      fs.accessSync(file, fs.constants.X_OK)
    } catch {
      console.error('[ERROR] CLI 不可执行:', file)
      process.exit(1)
    }
  }
  const help = spawnSync(file, ['--help'], { encoding: 'utf-8' })
  if (help.status !== 0) {
    console.error('[ERROR] CLI 无法运行:', file)
    console.error(help.stderr || help.stdout)
    process.exit(1)
  }
  console.log('[OK]', path.basename(file))
}

const modelsDir = path.join(__dirname, '..', 'resources', 'models')
const checks = [
  ['SenseVoice', path.join(modelsDir, 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17', 'model.int8.onnx')],
  ['SenseVoice tokens', path.join(modelsDir, 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17', 'tokens.txt')],
  ['Silero VAD', path.join(modelsDir, 'silero-vad', 'silero_vad.onnx')],
  ['Speaker segmentation', path.join(modelsDir, 'speaker-diarization', 'pyannote_segmentation.onnx')],
  ['Speaker embedding', path.join(modelsDir, 'speaker-diarization', '3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx')],
]

for (const [name, file] of checks) {
  if (!fs.existsSync(file)) {
    console.error('[ERROR] 缺少模型文件:', name, file)
    process.exit(1)
  }
  console.log('[OK]', name)
}

const qwenDir = path.join(modelsDir, 'sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25')
if (fs.existsSync(path.join(qwenDir, 'encoder.int8.onnx')) && fs.existsSync(path.join(qwenDir, 'decoder.int8.onnx'))) {
  console.log('[OK] Qwen3-ASR 可选模型')
} else {
  console.log('[INFO] Qwen3-ASR 可选模型未安装')
}

console.log('\n[OK] Sherpa CLI 验证完成')
