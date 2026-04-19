/**
 * 端到端测试脚本（直接调用 sherpa-onnx-node）
 * 运行: node scripts/test-e2e.js
 */
const sherpa = require('sherpa-onnx-node');
const path = require('path');

const modelDir = path.resolve(__dirname, '../resources/models/sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25');

const tests = [
  { name: '中文绕口令', file: 'raokouling.wav' },
  { name: '中文歌词', file: 'qiqiu1.wav' },
  { name: '英文噪音', file: 'noise1-en.wav' },
  { name: '粤语', file: 'cantonese.wav' },
  { name: '日语', file: 'ja1.wav' },
];

console.log('=== Qwen3-ASR-0.6B 端到端测试 ===\n');

// 加载模型
console.log('正在加载模型...');
const t0 = Date.now();

const recognizer = new sherpa.OfflineRecognizer({
  modelConfig: {
    qwen3Asr: {
      convFrontend: path.join(modelDir, 'conv_frontend.onnx'),
      encoder: path.join(modelDir, 'encoder.int8.onnx'),
      decoder: path.join(modelDir, 'decoder.int8.onnx'),
      tokenizer: path.join(modelDir, 'tokenizer'),
      maxTotalLen: 4096,
      maxNewTokens: 1024,
    },
    tokens: '',
    numThreads: 4,
    provider: 'cpu',
    debug: 0,
  },
  decodingMethod: 'greedy_search',
});

console.log(`模型加载完成，耗时: ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

// 逐个测试
for (const test of tests) {
  const wavPath = path.join(modelDir, 'test_wavs', test.file);
  console.log(`--- ${test.name} (${test.file}) ---`);

  const wave = sherpa.readWave(wavPath);
  const duration = (wave.samples.length / wave.sampleRate).toFixed(1);
  console.log(`时长: ${duration}s, 采样率: ${wave.sampleRate}`);

  const t1 = Date.now();
  const stream = recognizer.createStream();
  stream.acceptWaveform({ sampleRate: wave.sampleRate, samples: wave.samples });
  recognizer.decode(stream);
  const result = recognizer.getResult(stream);
  const elapsed = ((Date.now() - t1) / 1000).toFixed(1);

  console.log(`识别耗时: ${elapsed}s (RTF: ${(elapsed / duration).toFixed(2)})`);
  console.log(`结果: ${result.text.substring(0, 100)}${result.text.length > 100 ? '...' : ''}`);
  console.log(`tokens: ${result.tokens ? result.tokens.length : 0}`);
  console.log('');
}

console.log('=== 全部测试完成 ===');
