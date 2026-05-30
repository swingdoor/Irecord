/**
 * 统一 ASR 子进程脚本
 * 根据可用模型自动选择最佳策略：
 *   1. segmentation + embedding → 完整说话人分离
 *   2. Silero VAD → VAD 分段识别
 *   3. 都没有 → 整体识别
 */
const path = require('path');
const fs = require('fs');
const sherpa = require('sherpa-onnx-node');

// 直接拿到 native addon，用于在 sherpa 自带的 JSON.parse 崩溃时兜底
// （某些音频段 Qwen3-ASR 输出的 token 里混入了未转义的控制字符，
//   sherpa C++ 层序列化出的 JSON 非法，getResult 内部的 JSON.parse 会抛
//   "Bad control character in string literal in JSON"）
let rawResultAddon = null;
try {
  rawResultAddon = require('sherpa-onnx-node/addon.js');
} catch (_) {
  rawResultAddon = null;
}

// 打包后 extract.js 和 asr-process.js 都在 resources/ 根目录
// 开发时 asr-process.js 在 src/main/engine/，extract.js 在 src/main/keywords/
const isPackaged = !__dirname.includes('src');
const extractKeywordsPath = isPackaged
  ? path.join(__dirname, 'extract.js')
  : path.join(__dirname, '../keywords/extract.js');
const { extractKeywords } = require(extractKeywordsPath);

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

// 兜底：未捕获错误也要带着 stack 走 stderr，父进程会把 stderr 落到任务日志
process.on('uncaughtException', (err) => {
  process.stderr.write(`[uncaughtException] ${err && err.stack ? err.stack : String(err)}\n`);
  try { send({ type: 'error', message: `未捕获异常: ${err && err.message ? err.message : String(err)}`, stack: err && err.stack }); } catch (_) {}
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  const msg = reason && reason.stack ? reason.stack : String(reason);
  process.stderr.write(`[unhandledRejection] ${msg}\n`);
  try { send({ type: 'error', message: `未处理的 Promise 拒绝: ${reason && reason.message ? reason.message : String(reason)}`, stack: reason && reason.stack }); } catch (_) {}
  process.exit(1);
});

function formatTimestamp(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ========== ASR 引擎 ==========

function createRecognizer(modelDir, modelType, numThreads, asrParams = {}) {
  if (modelType === 'sensevoice-small') {
    return new sherpa.OfflineRecognizer({
      modelConfig: {
        senseVoice: {
          model: path.join(modelDir, 'model.int8.onnx'),
          language: '',
          useInverseTextNormalization: 1,
        },
        tokens: path.join(modelDir, 'tokens.txt'),
        numThreads,
        provider: 'cpu',
        debug: 0,
      },
      decodingMethod: 'greedy_search',
    });
  }

  // 默认: qwen3-asr
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
        maxTotalLen: asrParams.qwen3MaxTotalLen || 4096,
        maxNewTokens: asrParams.qwen3MaxNewTokens || 1024,
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
  const result = getResultSafe(recognizer, stream);
  // 统一净化出口：无论是正常拿到的还是兜底捞回的文本，都过一遍净化
  if (result && typeof result.text === 'string') {
    result.text = sanitizeText(result.text);
  }
  return result;
}

/**
 * 净化识别文本，剥掉模型偶发吐出的非法/脏字符，避免污染数据库与下游序列化。
 * 字节级 BPE 模型在音频被切碎或内容偏乱时可能退化吐出原始字节 token，
 * 表现为控制字符、落单的代理对、UTF-8 解码替换符等。
 * 保留 \t (0x09) 和 \n (0x0A)，它们在正常文本里可能有意义。
 */
function sanitizeText(text) {
  if (typeof text !== 'string') return '';
  return text
    // 控制字符：0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F, 0x7F（保留 \t \n）
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    // 落单的高代理（后面没跟低代理）
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    // 落单的低代理（前面没有高代理）
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    // UTF-8 解码失败的替换符
    .replace(/\uFFFD/g, '')
    .trim();
}

/**
 * 安全获取识别结果。
 * 优先走 sherpa 自带的 getResult；若其内部 JSON.parse 因非法控制字符抛错，
 * 则直接从 native addon 取原始 JSON 串，清洗掉字符串字面量里未转义的
 * 控制字符（0x00–0x1F，制表/换行除外）后重新解析，避免整段被丢弃。
 */
function getResultSafe(recognizer, stream) {
  try {
    return recognizer.getResult(stream);
  } catch (err) {
    if (!rawResultAddon || typeof rawResultAddon.getOfflineStreamResultAsJson !== 'function') {
      throw err;
    }
    const rawJson = rawResultAddon.getOfflineStreamResultAsJson(stream.handle);
    // 剥掉所有控制字符 0x00-0x1F：JSON 规范不允许字符串字面量里出现裸的控制字符
    // （含制表、换行、回车），全部清除后再解析，保住这一段文本而不是整段丢弃。
    const sanitized = rawJson.replace(/[\u0000-\u001F]/g, '');
    process.stderr.write(`[getResult-sanitized] rawLen=${rawJson.length} sanitizedLen=${sanitized.length} origErr=${err && err.message ? err.message : String(err)}\n`);
    return JSON.parse(sanitized);
  }
}

// 后处理说话人分离结果
function postProcessSegments(segments, asrParams = {}) {
  if (segments.length === 0) return [];

  const TRIMMED_MIN = asrParams.trimmedMinDuration || 0.5;
  const MERGE_GAP = asrParams.sameSpeakerMergeGap || 2.0;
  const MAX_DURATION = asrParams.maxSegmentDuration || 60.0;

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

    // 如果前段被裁剪后太短，移除
    if (prev.end - prev.start < TRIMMED_MIN) {
      trimmed.pop();
    }

    trimmed.push(curr);
  }

  // 3. 先合并相邻同说话人段（间隔 < MERGE_GAP，不限长度）
  const merged = [trimmed[0]];
  for (let i = 1; i < trimmed.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = trimmed[i];
    if (curr.speaker === prev.speaker && curr.start - prev.end < MERGE_GAP) {
      merged[merged.length - 1] = { ...prev, end: curr.end };
    } else {
      merged.push(curr);
    }
  }

  // 4. 超长段强制切分（保留 speaker），切分后不再合并
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
  const { wavPath, modelDir, modelType, segmentationModelPath, embeddingModelPath, numThreads } = args;
  const asrParams = args.asrParams || {};

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
      threshold: asrParams.clusteringThreshold || 0.85,
    },
    minDurationOn: asrParams.minDurationOn || 1.0,
    minDurationOff: asrParams.minDurationOff || 1.0,
  });

  const recognizer = createRecognizer(modelDir, modelType, numThreads, asrParams);

  send({ type: 'progress', stage: 'segmenting', percent: 20 });

  const wave = sherpa.readWave(wavPath);
  const sdResult = sd.process(wave.samples);

  // 后处理：过滤重叠、切分超长段、合并相邻同说话人段
  const processed = postProcessSegments(sdResult, asrParams);

  send({ type: 'progress', stage: 'recognizing', percent: 40 });

  const segments = [];
  const speakerStats = {};
  const minSampleLength = asrParams.minSampleLength || 1600;

  for (let i = 0; i < processed.length; i++) {
    const seg = processed[i];
    const speaker = `Speaker ${seg.speaker + 1}`;
    const start = Math.round(seg.start * 100) / 100;
    const end = Math.round(seg.end * 100) / 100;

    // 提取该段音频
    const startSample = Math.floor(seg.start * wave.sampleRate);
    const endSample = Math.min(Math.floor(seg.end * wave.sampleRate), wave.samples.length);
    const segSamples = wave.samples.slice(startSample, endSample);

    if (segSamples.length < minSampleLength) continue; // 跳过太短的段

    let text;
    try {
      const result = recognizeWave(recognizer, segSamples, wave.sampleRate);
      text = String(result.text || '').trim();
    } catch (segErr) {
      // 单段失败不中断整体；写到 stderr，父进程会落到日志
      process.stderr.write(`[diarization-seg-error] index=${i} start=${start} end=${end} speaker=${speaker} samples=${segSamples.length} err=${segErr && segErr.stack ? segErr.stack : String(segErr)}\n`);
      continue;
    }
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
  const displayMergeGap = asrParams.displayMergeGap || 0.5;
  for (const seg of segments) {
    if (!seg.text.trim()) continue; // 跳过去重后变空的段

    const last = mergedForDisplay[mergedForDisplay.length - 1];
    if (last && last.speaker === seg.speaker && seg.start - last.end < displayMergeGap) {
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
  const { wavPath, modelDir, modelType, vadModelPath, numThreads } = args;
  const asrParams = args.asrParams || {};

  send({ type: 'progress', stage: 'initializing', percent: 10 });

  const vad = new sherpa.Vad({
    sileroVad: {
      model: vadModelPath,
      threshold: asrParams.vadThreshold || 0.5,
      minSilenceDuration: asrParams.minSilenceDuration || 1.5,
      minSpeechDuration: asrParams.minSpeechDuration || 1.0,
      windowSize: 512,
    },
    sampleRate: 16000,
    debug: 0,
  });

  const recognizer = createRecognizer(modelDir, modelType, numThreads, asrParams);

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
  const minSampleLength = asrParams.minSampleLength || 1600;

  for (let i = 0; i < speechSegments.length; i++) {
    const seg = speechSegments[i];
    const start = Math.round(seg.start * 100) / 100;
    const samples = seg.samples;

    if (samples.length < minSampleLength) continue;

    const duration = samples.length / 16000;
    const end = Math.round((seg.start + duration) * 100) / 100;

    let text;
    try {
      const result = recognizeWave(recognizer, samples, 16000);
      text = String(result.text || '').trim();
    } catch (segErr) {
      process.stderr.write(`[vad-seg-error] index=${i} start=${start} end=${end} samples=${samples.length} err=${segErr && segErr.stack ? segErr.stack : String(segErr)}\n`);
      continue;
    }
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
  const { wavPath, modelDir, modelType, numThreads } = args;
  const asrParams = args.asrParams || {};

  send({ type: 'progress', stage: 'initializing', percent: 10 });

  const recognizer = createRecognizer(modelDir, modelType, numThreads, asrParams);

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
  let stage = 'parse-args';
  let args;
  try {
    args = JSON.parse(inputData);

    stage = 'select-strategy';
    const hasSegmentation = args.segmentationModelPath && fs.existsSync(args.segmentationModelPath);
    const hasEmbedding = args.embeddingModelPath && fs.existsSync(args.embeddingModelPath);
    const hasVAD = args.vadModelPath && fs.existsSync(args.vadModelPath);

    process.stderr.write(`[strategy-decision] hasSegmentation=${hasSegmentation} hasEmbedding=${hasEmbedding} hasVAD=${hasVAD}\n`);

    if (hasSegmentation && hasEmbedding) {
      stage = 'diarization';
      runWithDiarization(args);
    } else if (hasVAD) {
      stage = 'vad';
      runWithVAD(args);
    } else {
      stage = 'plain';
      runPlain(args);
    }
  } catch (err) {
    const errMsg = err && err.message ? err.message : '未知错误';
    const errStack = err && err.stack ? err.stack : '';
    process.stderr.write(`[fatal-error] stage=${stage} err=${errStack || errMsg}\n`);
    send({ type: 'error', message: `[${stage}] ${errMsg}`, stack: errStack });
  }
});
