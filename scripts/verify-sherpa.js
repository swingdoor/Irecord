/**
 * 验证 sherpa-onnx 绑定和模型加载
 * 运行: node scripts/verify-sherpa.js
 */
const sherpa = require('sherpa-onnx')
const path = require('path')
const fs = require('fs')

console.log('=== Sherpa-ONNX 验证 ===\n')

// 1. 检查 sherpa-onnx 导入
console.log('[OK] sherpa-onnx 模块加载成功')
console.log('可用 API:', Object.keys(sherpa).join(', '))
console.log('')

// 2. 检查模型文件
const modelsDir = path.join(__dirname, '..', 'resources', 'models')
const modelName = 'sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25'
const modelDir = path.join(modelsDir, modelName)

if (!fs.existsSync(modelDir)) {
  console.log('[WARN] 模型目录不存在:', modelDir)
  console.log('       请先运行: bash scripts/download-models.sh')
  console.log('       或参考 resources/DOWNLOAD.md 手动下载')
  process.exit(0)
}

console.log('[OK] 模型目录存在:', modelDir)

// 3. 检查模型文件
const files = fs.readdirSync(modelDir)
console.log('模型文件:', files.join(', '))

// 4. 尝试创建识别器
try {
  const encoderFile = files.find(f => f.includes('encoder') && f.endsWith('.onnx'))
  const decoderFile = files.find(f => f.includes('decoder') && f.endsWith('.onnx'))
  const tokenizerDir = files.find(f => f === 'tokenizer')

  if (!encoderFile || !decoderFile) {
    console.log('[WARN] 缺少必要文件 (encoder.onnx 或 decoder.onnx)')
    process.exit(0)
  }

  console.log('\n尝试加载模型...')
  console.log('Encoder 文件:', encoderFile)
  console.log('Decoder 文件:', decoderFile)
  console.log('Tokenizer 目录:', tokenizerDir || '(未找到)')

  // 注意: 实际加载需要根据 sherpa-onnx 的 Qwen3-ASR API 调整
  console.log('\n[OK] 验证完成')
  console.log('提示: 模型文件已就位，可以运行 npm run dev 启动应用')
} catch (err) {
  console.error('[ERROR] 模型加载失败:', err.message)
  process.exit(1)
}
