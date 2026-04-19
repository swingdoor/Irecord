/**
 * ASR 子进程脚本
 * 通过 node（非 Electron）运行，避免 external buffer 限制
 * 通过 stdout JSON 行通信
 */
const sherpa = require('sherpa-onnx-node');
const path = require('path');
const fs = require('fs');

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function processAudio(args) {
  const { wavPath, modelDir, numThreads } = args;

  // 阶段1: 加载模型
  send({ type: 'progress', stage: 'initializing', percent: 5 });

  const files = fs.readdirSync(modelDir);
  const convFrontendFile = files.find(f => f.includes('conv') && f.includes('frontend') && f.endsWith('.onnx'));
  const encoderFile = files.find(f => f.includes('encoder') && f.endsWith('.onnx'));
  const decoderFile = files.find(f => f.includes('decoder') && f.endsWith('.onnx'));
  const tokenizerDir = files.find(f => f === 'tokenizer');

  if (!encoderFile || !decoderFile) {
    send({ type: 'error', message: '模型文件不完整' });
    return;
  }

  const recognizer = new sherpa.OfflineRecognizer({
    modelConfig: {
      qwen3Asr: {
        convFrontend: convFrontendFile ? path.join(modelDir, convFrontendFile) : '',
        encoder: path.join(modelDir, encoderFile),
        decoder: path.join(modelDir, decoderFile),
        tokenizer: tokenizerDir ? path.join(modelDir, tokenizerDir) : '',
        maxTotalLen: 4096,
        maxNewTokens: 1024,
        temperature: 1e-6,
        topP: 0.8,
        seed: 42,
        hotwords: '',
      },
      tokens: '',
      numThreads: numThreads || 4,
      provider: 'cpu',
      debug: 0,
    },
    decodingMethod: 'greedy_search',
  });

  // 阶段2: 读取音频
  send({ type: 'progress', stage: 'initializing', percent: 30 });

  const wave = sherpa.readWave(wavPath);
  const audioDuration = wave.samples.length / wave.sampleRate;

  // 阶段3: 识别
  send({ type: 'progress', stage: 'recognizing', percent: 50 });

  const stream = recognizer.createStream();
  stream.acceptWaveform({ sampleRate: wave.sampleRate, samples: wave.samples });
  recognizer.decode(stream);
  const result = recognizer.getResult(stream);

  send({ type: 'progress', stage: 'done', percent: 100 });

  // 返回纯文本结果，不包含时间戳（Qwen3-ASR 不支持）
  const tokens = Array.from(result.tokens || []).map(t => String(t));

  send({
    type: 'result',
    text: String(result.text || ''),
    tokens,
    lang: String(result.lang || 'zh'),
  });
}

// 从 stdin 读取参数
let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const args = JSON.parse(input);
    processAudio(args);
  } catch (err) {
    send({ type: 'error', message: err.message || '未知错误' });
  }
});
