/**
 * 统一 ASR 子进程脚本
 * 根据可用模型自动选择最佳策略：
 *   1. segmentation + embedding → 完整说话人分离
 *   2. Silero VAD → VAD 分段识别
 *   3. 都没有 → 整体识别
 */
const sherpa = require('sherpa-onnx-node');
const path = require('path');
const fs = require('fs');
const { extractKeywords } = require('../keywords/extract.js');

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function formatTimestamp(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ========== ASR 引擎 ==========

function createRecognizer(modelDir, numThreads) {
  const files = fs.readdirSync(modelDir);
  const convFrontendFile = files.find(f => f.includes('conv') && f.includes('frontend') && f.endsWith('.onnx'));
  const encoderFile = files.find(f => f.includes('encoder') && f.endsWith('.onnx'));
  const decoderFile = files.find(f => f.includes('decoder') && f.endsWith('.onnx'));
  const tokenizerDir = files.find(f => f === 'tokenizer');

  if (!encoderFile || !decoderFile) {
    throw new Error('模型文件不完整，缺少 encoder 或 decoder');
  }

  return new sherpa.OfflineRecognizer({
    modelConfig: {
      qwen3Asr: {
        convFrontend: convFrontendFile ? path.join(modelDir, convFrontendFile) : '',
        encoder: path.join(modelDir, encoderFile),
        decoder: path.join(modelDir, decoderFile),
        tokenizer: tokenizerDir ? path.join(modelDir, tokenizerDir) : '',
        maxTotalLen: 4096,
        maxNewTokens: 1024,
      },
      tokens: '',
      numThreads,
      provider: 'cpu',
      debug: 0,
    },
    decodingMethod: 'greedy_search',
  });
}

function recognizeWave(recognizer, samples, sampleRate) {
  const stream = recognizer.createStream();
  stream.acceptWaveform({ sampleRate, samples });
  recognizer.decode(stream);
  return recognizer.getResult(stream);
}

// 后处理说话人分离结果
function postProcessSegments(segments) {
  if (segments.length === 0) return [];

  // 1. 按开始时间排序
  const sorted = segments.slice().sort((a, b) => a.start - b.start);

  // 2. 裁剪重叠部分：如果两段有重叠，裁剪前段的结束时间
  const trimmed = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const prev = trimmed[trimmed.length - 1];
    const curr = { ...sorted[i] };

    if (curr.start < prev.end) {
      // 有重叠，裁剪前段的结束时间
      prev.end = curr.start;
    }

    // 如果前段被裁剪后太短（< 0.5s），移除
    if (prev.end - prev.start < 0.5) {
      trimmed.pop();
    }

    trimmed.push(curr);
  }

  // 3. 先合并相邻同说话人段（间隔 < 2 秒，不限长度）
  const merged = [trimmed[0]];
  for (let i = 1; i < trimmed.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = trimmed[i];
    if (curr.speaker === prev.speaker && curr.start - prev.end < 2.0) {
      merged[merged.length - 1] = { ...prev, end: curr.end };
    } else {
      merged.push(curr);
    }
  }

  // 4. 超长段强制切分（保留 speaker），切分后不再合并
  const MAX_DURATION = 30.0;
  const result = [];
  for (const seg of merged) {
    const dur = seg.end - seg.start;
    if (dur <= MAX_DURATION) {
      result.push(seg);
    } else {
      let offset = seg.start;
      while (offset < seg.end) {
        const end = Math.min(offset + MAX_DURATION, seg.end);
        result.push({ ...seg, start: offset, end });
        offset = end;
      }
    }
  }

  return result;
}

// ========== 策略 1: 说话人分离 ==========

function runWithDiarization(args) {
  const { wavPath, modelDir, segmentationModelPath, embeddingModelPath, numThreads } = args;

  send({ type: 'progress', stage: 'initializing', percent: 10 });

  const sd = new sherpa.OfflineSpeakerDiarization({
    segmentation: {
      pyannote: { model: segmentationModelPath },
      numThreads,
      debug: 0,
    },
    embedding: {
      model: embeddingModelPath,
      numThreads,
      debug: 0,
    },
    clustering: {
      threshold: 0.85, // 提高阈值，减少误判说话人数量
    },
    minDurationOn: 1.0,  // 最短语音段 1 秒，过滤碎片
    minDurationOff: 1.0, // 最短静音 1 秒，避免过度切分
  });

  const recognizer = createRecognizer(modelDir, numThreads);

  send({ type: 'progress', stage: 'segmenting', percent: 20 });

  const wave = sherpa.readWave(wavPath);
  const sdResult = sd.process(wave.samples);

  // 后处理：过滤重叠、切分超长段、合并相邻同说话人段
  const processed = postProcessSegments(sdResult);

  send({ type: 'progress', stage: 'recognizing', percent: 40 });

  const segments = [];
  const speakerStats = {};

  for (let i = 0; i < processed.length; i++) {
    const seg = processed[i];
    const speaker = `Speaker ${seg.speaker + 1}`;
    const start = Math.round(seg.start * 100) / 100;
    const end = Math.round(seg.end * 100) / 100;

    // 提取该段音频
    const startSample = Math.floor(seg.start * wave.sampleRate);
    const endSample = Math.min(Math.floor(seg.end * wave.sampleRate), wave.samples.length);
    const segSamples = wave.samples.slice(startSample, endSample);

    if (segSamples.length < 1600) continue; // 跳过太短的段

    const result = recognizeWave(recognizer, segSamples, wave.sampleRate);
    const text = String(result.text || '').trim();
    if (!text) continue;

    segments.push({ text, start, end, speaker });

    if (!speakerStats[speaker]) {
      speakerStats[speaker] = { segments: 0, duration: 0 };
    }
    speakerStats[speaker].segments++;
    speakerStats[speaker].duration += end - start;

    const progress = 40 + Math.floor((i + 1) / processed.length * 55);
    send({ type: 'progress', stage: 'recognizing', percent: progress });
  }

  // 统计时长取两位小数
  for (const key of Object.keys(speakerStats)) {
    speakerStats[key].duration = Math.round(speakerStats[key].duration * 100) / 100;
  }

  // 合并相邻同说话人段的文本和时间范围（用于最终显示）
  const mergedForDisplay = [];
  for (const seg of segments) {
    if (!seg.text.trim()) continue; // 跳过去重后变空的段

    const last = mergedForDisplay[mergedForDisplay.length - 1];
    if (last && last.speaker === seg.speaker && seg.start - last.end < 0.5) {
      // 相邻同说话人段，合并文本和时间
      last.text += seg.text;
      last.end = seg.end;
    } else {
      mergedForDisplay.push({ ...seg });
    }
  }

  const fullText = mergedForDisplay.map(s => s.text).join('\n');

  send({ type: 'progress', stage: 'done', percent: 100 });
  send({ type: 'result', text: fullText, segments: mergedForDisplay, speakerStats, keywords: extractKeywords(fullText), lang: 'zh', strategy: 'speaker-diarization' });
}

// ========== 策略 2: VAD 分段 ==========

function runWithVAD(args) {
  const { wavPath, modelDir, vadModelPath, numThreads } = args;

  send({ type: 'progress', stage: 'initializing', percent: 10 });

  const vad = new sherpa.Vad({
    sileroVad: {
      model: vadModelPath,
      threshold: 0.5,
      minSilenceDuration: 1.5, // 1.5 秒静音才切分，减少碎片
      minSpeechDuration: 1.0,  // 最短语音段 1 秒
      windowSize: 512,
    },
    sampleRate: 16000,
    debug: 0,
  });

  const recognizer = createRecognizer(modelDir, numThreads);

  send({ type: 'progress', stage: 'segmenting', percent: 20 });

  const wave = sherpa.readWave(wavPath);

  // 逐窗口送入 VAD
  const windowSize = 512;
  for (let i = 0; i + windowSize <= wave.samples.length; i += windowSize) {
    const chunk = wave.samples.slice(i, i + windowSize);
    vad.acceptWaveform(chunk);
  }
  vad.flush();

  // 收集所有语音段
  const speechSegments = [];
  while (!vad.isEmpty()) {
    speechSegments.push(vad.front());
    vad.pop();
  }

  send({ type: 'progress', stage: 'recognizing', percent: 40 });

  const segments = [];

  for (let i = 0; i < speechSegments.length; i++) {
    const seg = speechSegments[i];
    const start = Math.round(seg.start * 100) / 100;
    const samples = seg.samples;

    if (samples.length < 1600) continue;

    const duration = samples.length / 16000;
    const end = Math.round((seg.start + duration) * 100) / 100;

    const result = recognizeWave(recognizer, samples, 16000);
    const text = String(result.text || '').trim();
    if (!text) continue;

    segments.push({ text, start, end });

    const progress = 40 + Math.floor((i + 1) / speechSegments.length * 55);
    send({ type: 'progress', stage: 'recognizing', percent: progress });
  }

  const fullText = segments.map(s => s.text).join('\n');

  send({ type: 'progress', stage: 'done', percent: 100 });
  send({ type: 'result', text: fullText, segments, keywords: extractKeywords(fullText), lang: 'zh', strategy: 'vad' });
}

// ========== 策略 3: 整体识别 ==========

function runPlain(args) {
  const { wavPath, modelDir, numThreads } = args;

  send({ type: 'progress', stage: 'initializing', percent: 10 });

  const recognizer = createRecognizer(modelDir, numThreads);

  send({ type: 'progress', stage: 'recognizing', percent: 30 });

  const wave = sherpa.readWave(wavPath);
  const result = recognizeWave(recognizer, wave.samples, wave.sampleRate);

  const text = String(result.text || '');
  send({ type: 'progress', stage: 'done', percent: 100 });
  send({
    type: 'result',
    text,
    keywords: extractKeywords(text),
    lang: String(result.lang || 'zh'),
    strategy: 'plain',
  });
}

// ========== 入口 ==========

let inputData = '';
process.stdin.on('data', (chunk) => { inputData += chunk; });
process.stdin.on('end', () => {
  try {
    const args = JSON.parse(inputData);

    const hasSegmentation = args.segmentationModelPath && fs.existsSync(args.segmentationModelPath);
    const hasEmbedding = args.embeddingModelPath && fs.existsSync(args.embeddingModelPath);
    const hasVAD = args.vadModelPath && fs.existsSync(args.vadModelPath);

    if (hasSegmentation && hasEmbedding) {
      runWithDiarization(args);
    } else if (hasVAD) {
      runWithVAD(args);
    } else {
      runPlain(args);
    }
  } catch (err) {
    send({ type: 'error', message: err.message || '未知错误' });
  }
});
