/**
 * VAD + ASR 子进程脚本
 * 使用 VAD 切分音频段，每段单独识别，得到带时间戳的结果
 */
const sherpa = require('sherpa-onnx-node');
const path = require('path');
const fs = require('fs');

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function processAudioWithVAD(args) {
  const { wavPath, modelDir, vadModelPath, numThreads } = args;

  send({ type: 'progress', stage: 'initializing', percent: 5 });

  // 1. 加载 VAD 模型
  if (!fs.existsSync(vadModelPath)) {
    send({ type: 'error', message: 'VAD 模型不存在，请下载 silero_vad.onnx' });
    return;
  }

  const vad = new sherpa.Vad({
    sileroVad: {
      model: vadModelPath,
      threshold: 0.5,
      minSilenceDuration: 2.0,  // 2秒静音才切分（说话人切换/长停顿）
      minSpeechDuration: 1.0,   // 至少1秒语音才算有效段
      windowSize: 512,
    },
    sampleRate: 16000,
    debug: 0,
  });

  send({ type: 'progress', stage: 'initializing', percent: 15 });

  // 2. 加载 ASR 模型
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

  send({ type: 'progress', stage: 'initializing', percent: 30 });

  // 3. 读取音频
  const wave = sherpa.readWave(wavPath);
  const sampleRate = wave.sampleRate;
  const samples = wave.samples;

  send({ type: 'progress', stage: 'segmenting', percent: 40 });

  // 4. VAD 切分语音段
  const windowSize = 512; // 32ms @ 16kHz
  const segments = [];
  let offset = 0;

  while (offset < samples.length) {
    const end = Math.min(offset + windowSize, samples.length);
    const chunk = samples.slice(offset, end);

    vad.acceptWaveform(chunk);

    while (!vad.isEmpty()) {
      const segment = vad.front();
      vad.pop();

      // segment.samples 是 Float32Array
      // segment.start 是样本偏移量
      const startTime = segment.start / sampleRate;
      const duration = segment.samples.length / sampleRate;

      segments.push({
        samples: segment.samples,
        start: startTime,
        duration: duration,
      });
    }

    offset = end;
  }

  vad.flush();
  while (!vad.isEmpty()) {
    const segment = vad.front();
    vad.pop();
    const startTime = segment.start / sampleRate;
    const duration = segment.samples.length / sampleRate;
    segments.push({
      samples: segment.samples,
      start: startTime,
      duration: duration,
    });
  }

  send({ type: 'progress', stage: 'recognizing', percent: 50 });

  // 5. 对每个语音段识别
  const results = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const stream = recognizer.createStream();
    stream.acceptWaveform({ sampleRate, samples: seg.samples });
    recognizer.decode(stream);
    const result = recognizer.getResult(stream);

    if (result.text.trim()) {
      results.push({
        text: String(result.text),
        start: Math.round(seg.start * 100) / 100,
        end: Math.round((seg.start + seg.duration) * 100) / 100,
      });
    }

    const progress = 50 + Math.floor((i + 1) / segments.length * 40);
    send({ type: 'progress', stage: 'recognizing', percent: progress });
  }

  send({ type: 'progress', stage: 'done', percent: 100 });

  // 6. 合并结果
  const fullText = results.map(r => r.text).join('');
  const segments_with_timestamps = results;

  send({
    type: 'result',
    text: fullText,
    segments: segments_with_timestamps,
    lang: 'zh',
  });
}

// 从 stdin 读取参数
let input = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const args = JSON.parse(input);
    processAudioWithVAD(args);
  } catch (err) {
    send({ type: 'error', message: err.message || '未知错误' });
  }
});
