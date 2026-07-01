/**
 * 统一 ASR 子进程脚本
 * 根据可用模型自动选择最佳策略：
 *   1. segmentation + embedding → 完整说话人分离
 *   2. Silero VAD → VAD 分段识别
 *   3. 都没有 → 整体识别
 */
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const sherpa = require('sherpa-onnx-node');
// 说话人 embedding 改用 onnxruntime-node 直接跑 ERES2Net（sherpa 的 embedding 在
// macOS/Apple Silicon 上内存随音频时长累积,见 change replace-embedding-with-onnxruntime）。
// ASR/VAD/readWave 仍用 sherpa（无内存问题）。
const ort = require('onnxruntime-node');
const { computeFbank, NUM_MEL } = require('./kaldi-fbank');

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

// ========== 策略 1: 说话人分离 ==========

/** 余弦相似度 */
function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** 多个向量求均值（代表向量） */
function meanEmbedding(vectors, dim) {
  const acc = new Float32Array(dim);
  for (const v of vectors) for (let i = 0; i < dim; i++) acc[i] += v[i];
  for (let i = 0; i < dim; i++) acc[i] /= vectors.length;
  return acc;
}

/**
 * 创建并复用 ERES2Net 的 onnxruntime InferenceSession（进程内单例,内存不随段数累积）。
 */
async function createEmbeddingSession(embeddingModelPath) {
  return ort.InferenceSession.create(embeddingModelPath, {
    enableCpuMemArena: true,
    intraOpNumThreads: 4,
  });
}

/**
 * 计算一段样本的说话人 embedding：自实现 kaldi fbank → onnxruntime 推理 → 512 维向量。
 * fbank 与 kaldi-native-fbank 数值对齐(见 kaldi-fbank.js)。段太短(无帧)返回 null。
 */
async function computeEmbedding(session, samples) {
  const { feat, T } = computeFbank(samples);
  if (T === 0) return null;
  const out = await session.run({ x: new ort.Tensor('float32', feat, [1, T, NUM_MEL]) });
  return Float32Array.from(out.embedding.data);
}

/**
 * 多窗平均 embedding（降噪,见 design.md D2）：段内等距取 numWin 个 ~winSec 窗口,
 * 各算 embedding 后求均值作为该段代表向量。段短于一个窗口时退化为单次。
 * 任一窗口失败则跳过该窗；全部失败返回 null。
 */
async function computeEmbeddingMultiWin(session, samples, sampleRate, numWin = 3, winSec = 10) {
  const winSamples = Math.floor(winSec * sampleRate);
  const vecs = [];
  if (samples.length <= winSamples) {
    try { const v = await computeEmbedding(session, samples); if (v) vecs.push(v); } catch (_) { /* skip */ }
  } else {
    const maxStart = samples.length - winSamples;
    for (let k = 0; k < numWin; k++) {
      const start = Math.round(numWin === 1 ? 0 : (maxStart * k) / (numWin - 1));
      try { const v = await computeEmbedding(session, samples.slice(start, start + winSamples)); if (v) vecs.push(v); } catch (_) { /* skip */ }
    }
  }
  if (vecs.length === 0) return null;
  if (vecs.length === 1) return vecs[0];
  return meanEmbedding(vecs, vecs[0].length);
}


// ===== 谱聚类 NME-SC（快速模式用，eigengap 自动定人数，见 design.md D3）=====

/** Jacobi 特征分解（对称矩阵）。返回 { values: Float64Array, V: Float64Array[] }，V 为按列特征向量。 */
function jacobiEigen(Ain, maxIter = 100) {
  const n = Ain.length;
  const A = Ain.map(r => Float64Array.from(r));
  const V = Array.from({ length: n }, (_, i) => { const r = new Float64Array(n); r[i] = 1; return r; });
  for (let iter = 0; iter < maxIter; iter++) {
    let p = 0, q = 1, off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { if (Math.abs(A[i][j]) > off) { off = Math.abs(A[i][j]); p = i; q = j; } }
    if (off < 1e-9) break;
    const app = A[p][p], aqq = A[q][q], apq = A[p][q];
    const phi = 0.5 * Math.atan2(2 * apq, aqq - app);
    const c = Math.cos(phi), s = Math.sin(phi);
    for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
    for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
    for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
  }
  const values = new Float64Array(n);
  for (let i = 0; i < n; i++) values[i] = A[i][i];
  return { values, V };
}

/** k-means（确定性最远点初始化，避免随机导致标签漂移）。rows: Float64Array[]。返回标签数组。 */
function kmeansDet(rows, k, iters = 50) {
  const n = rows.length, d = rows[0].length;
  const dist2 = (a, b) => { let s = 0; for (let i = 0; i < d; i++) { const x = a[i] - b[i]; s += x * x; } return s; };
  // 最远点初始化：固定从 row 0 起，依次选离已有质心集合最远的点
  const cent = [Float64Array.from(rows[0])];
  while (cent.length < k) {
    let best = -1, bestD = -1;
    for (let i = 0; i < n; i++) {
      let dmin = Infinity;
      for (const c of cent) { const dd = dist2(rows[i], c); if (dd < dmin) dmin = dd; }
      if (dmin > bestD) { bestD = dmin; best = i; }
    }
    cent.push(Float64Array.from(rows[best]));
  }
  let labels = new Array(n).fill(0);
  for (let it = 0; it < iters; it++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let bd = Infinity, bl = 0;
      for (let c = 0; c < k; c++) { const s = dist2(rows[i], cent[c]); if (s < bd) { bd = s; bl = c; } }
      if (labels[i] !== bl) { labels[i] = bl; changed = true; }
    }
    const acc = Array.from({ length: k }, () => new Float64Array(d)); const cnt = new Array(k).fill(0);
    for (let i = 0; i < n; i++) { cnt[labels[i]]++; for (let j = 0; j < d; j++) acc[labels[i]][j] += rows[i][j]; }
    for (let c = 0; c < k; c++) if (cnt[c]) for (let j = 0; j < d; j++) cent[c][j] = acc[c][j] / cnt[c];
    if (!changed && it > 0) break;
  }
  return labels;
}

/**
 * 谱聚类 NME-SC：余弦相似度 → 截断负值取 p-近邻 affinity → 对称化 → 归一化拉普拉斯
 * → Jacobi 特征分解 → 最大 eigengap 估 k → 前 k 特征向量行归一化 → k-means。
 * eigengap 自动定人数；塌缩保护：n≥2 而估计 k=1 时至少取 2（见 design.md D3）。
 * 返回与 embeddings 平行的标签数组（簇编号按首次出现顺序）。
 */
function spectralCluster(embeddings, pNeighbors = 10) {
  const n = embeddings.length;
  if (n === 0) return [];
  if (n === 1) return [0];
  if (n === 2) return [0, 1];

  // 相似度矩阵
  const S = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = i; j < n; j++) { const v = cosineSimilarity(embeddings[i], embeddings[j]); S[i][j] = v; S[j][i] = v; }

  // p-近邻 affinity（截断负相似度），对称化
  const p = Math.min(pNeighbors, n - 1);
  const A = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    const sims = [];
    for (let j = 0; j < n; j++) if (j !== i) sims.push([j, Math.max(0, S[i][j])]);
    sims.sort((a, b) => b[1] - a[1]);
    for (let t = 0; t < p; t++) A[i][sims[t][0]] = sims[t][1];
  }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const v = Math.max(A[i][j], A[j][i]); A[i][j] = v; A[j][i] = v; }

  // 归一化拉普拉斯 L = I - D^-1/2 A D^-1/2
  const deg = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += A[i][j]; deg[i] = s || 1e-9; }
  const L = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) L[i][j] = (i === j ? 1 : 0) - A[i][j] / Math.sqrt(deg[i] * deg[j]);

  // 特征分解，按特征值升序
  const { values, V } = jacobiEigen(L);
  const order = Array.from(values.keys()).sort((a, b) => values[a] - values[b]);

  // eigengap 估 k（看前 maxK 个间隙取最大）
  const maxK = Math.min(10, n - 1);
  let bestGap = -1, estK = 1;
  for (let k = 1; k < maxK; k++) { const gap = values[order[k]] - values[order[k - 1]]; if (gap > bestGap) { bestGap = gap; estK = k; } }
  // 塌缩保护：n≥2 而估计 k=1 时至少取 2
  let k = estK;
  if (n >= 2 && k < 2) k = 2;

  // 谱嵌入：前 k 个特征向量按行，行归一化
  const rows = Array.from({ length: n }, () => new Float64Array(k));
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < k; c++) rows[i][c] = V[i][order[c]];
    let nr = 0; for (let c = 0; c < k; c++) nr += rows[i][c] ** 2; nr = Math.sqrt(nr) || 1;
    for (let c = 0; c < k; c++) rows[i][c] /= nr;
  }
  const raw = kmeansDet(rows, k);

  // 按首次出现顺序重排簇编号（与输入顺序无关地稳定）
  const remap = new Map(); let next = 0;
  const labels = raw.map(l => { if (!remap.has(l)) remap.set(l, next++); return remap.get(l); });
  process.stderr.write(`[spectral] segments=${n} pNeighbors=${p} estK=${estK} k=${k} clusters=${next}\n`);
  return labels;
}

/**
 * 快速模式：readWave → VAD（maxSpeechDuration 强切）→ 逐段识别（空文本丢弃）
 * → 逐段多窗平均 embedding → 谱聚类 NME-SC（eigengap 自动定人数）→ 合并相邻同说话人。
 * 单进程线性处理，峰值 ~1GB（见 design.md D2/D3）。
 */
async function runFastDiarization(args) {
  const { wavPath, modelDir, modelType, embeddingModelPath, vadModelPath, numThreads } = args;
  const asrParams = args.asrParams || {};
  const minSampleLength = asrParams.minSampleLength || 1600;

  send({ type: 'progress', stage: 'initializing', percent: 10 });

  const recognizer = createRecognizer(modelDir, modelType, numThreads, asrParams);
  // 说话人 embedding 用 onnxruntime-node 直接跑 ERES2Net（内存不随时长累积）。
  const embSession = await createEmbeddingSession(embeddingModelPath);

  // VAD 在源头限制单段最大时长（vadMaxSpeechDuration），超过即强制切分（见 design.md D2）。
  const windowSize = 512;
  const vad = new sherpa.Vad({
    sileroVad: {
      model: vadModelPath,
      threshold: asrParams.vadThreshold || 0.5,
      minSilenceDuration: asrParams.minSilenceDuration || 1.5,
      minSpeechDuration: asrParams.minSpeechDuration || 1.0,
      maxSpeechDuration: asrParams.vadMaxSpeechDuration || 60,
      windowSize,
    },
    sampleRate: 16000,
    debug: 0,
  });

  send({ type: 'progress', stage: 'segmenting', percent: 20 });

  // enableExternalBuffer=false：Electron 自带的 V8 开启了 sandbox，禁止外部内存支撑的
  // ArrayBuffer。让 sherpa 把样本复制进 V8 内部 buffer，避免 "External buffers are not allowed"。
  const wave = sherpa.readWave(wavPath, false);

  for (let i = 0; i + windowSize <= wave.samples.length; i += windowSize) {
    vad.acceptWaveform(wave.samples.slice(i, i + windowSize));
  }
  vad.flush();

  const speechSegments = [];
  while (!vad.isEmpty()) {
    speechSegments.push(vad.front(false)); // { start(秒), samples }
    vad.pop();
  }
  process.stderr.write(`[fast-diarization] totalSamples=${wave.samples.length} vadSegments=${speechSegments.length} maxSpeech=${asrParams.vadMaxSpeechDuration || 60}\n`);

  send({ type: 'progress', stage: 'recognizing', percent: 40 });

  // 逐段：先识别（空文本立即丢弃），再算多窗平均 embedding。
  // emb 为 null 表示该段提取失败——保留文本、稍后标 speaker=null，不因 emb 失败丢文本。
  const items = []; // { start, end, text, emb: Float32Array|null }
  for (let i = 0; i < speechSegments.length; i++) {
    const seg = speechSegments[i];
    // sherpa SpeechSegment.start 是样本下标（int32），换算到秒得到全局时间轴。
    const startSec = seg.start / 16000;
    const start = Math.round(startSec * 100) / 100;
    const samples = seg.samples;
    if (samples.length < minSampleLength) continue;

    const end = Math.round((startSec + samples.length / 16000) * 100) / 100;

    let text;
    try {
      const result = recognizeWave(recognizer, samples, 16000);
      text = String(result.text || '').trim();
    } catch (segErr) {
      process.stderr.write(`[diarization-seg-error] index=${i} start=${start} end=${end} samples=${samples.length} err=${segErr && segErr.stack ? segErr.stack : String(segErr)}\n`);
      continue;
    }
    if (!text) continue; // 静音/噪声段在聚类前淘汰

    // 多窗平均 embedding（降噪）：段内等距 3 窗、每窗 10s。失败返回 null，不影响文本保留。
    const emb = await computeEmbeddingMultiWin(embSession, samples, 16000, 3, 10);

    items.push({ start, end, text, emb });

    const progress = 40 + Math.floor((i + 1) / speechSegments.length * 50);
    send({ type: 'progress', stage: 'recognizing', percent: progress });
  }

  // 谱聚类（NME-SC，自动定人数）：只对成功取到 emb 的段聚类；emb 失败的段 speaker 置 null。
  send({ type: 'progress', stage: 'clustering', percent: 92 });
  const embIndices = [];
  const embVectors = [];
  for (let i = 0; i < items.length; i++) {
    if (items[i].emb) { embIndices.push(i); embVectors.push(items[i].emb); }
  }
  const labels = spectralCluster(embVectors);
  for (let k = 0; k < embIndices.length; k++) {
    items[embIndices[k]].speaker = `Speaker ${labels[k] + 1}`;
  }
  for (const it of items) { if (!it.speaker) it.speaker = null; }

  // 合并相邻同说话人段（间隔 < sameSpeakerMergeGap，文本换行拼接）。
  // speaker 为 null 的段不与任何段合并（身份未知，避免误并）。
  const mergeGap = asrParams.sameSpeakerMergeGap || 2.0;
  const merged = [];
  for (const it of items) {
    const last = merged[merged.length - 1];
    if (last && it.speaker !== null && last.speaker === it.speaker && it.start - last.end < mergeGap) {
      last.text += '\n' + it.text;
      last.end = it.end;
    } else {
      merged.push({ start: it.start, end: it.end, text: it.text, speaker: it.speaker });
    }
  }

  // segments 输出 + speakerStats（null speaker 不计入统计）
  const segments = [];
  const speakerStats = {};
  for (const m of merged) {
    const seg = { text: m.text, start: m.start, end: m.end };
    if (m.speaker) {
      seg.speaker = m.speaker;
      if (!speakerStats[m.speaker]) speakerStats[m.speaker] = { segments: 0, duration: 0 };
      speakerStats[m.speaker].segments++;
      speakerStats[m.speaker].duration += m.end - m.start;
    }
    segments.push(seg);
  }
  for (const key of Object.keys(speakerStats)) {
    speakerStats[key].duration = Math.round(speakerStats[key].duration * 100) / 100;
  }

  const fullText = segments.map(s => s.text).join('\n');

  send({ type: 'progress', stage: 'done', percent: 100 });
  send({ type: 'result', text: fullText, segments, speakerStats, keywords: extractKeywords(fullText), lang: 'zh', strategy: 'speaker-diarization' });
}

// ========== 精确模式：孙进程隔离 sd.process（见 design.md D1）==========

/**
 * 孙进程：readWave(整段) → sd.process(整段) 一次 → emit [{start,end,speaker}] JSON → 退出。
 * 只做分离、不加载识别器；退出后 OS 回收其 ~4.5GB，与主进程识别阶段内存错峰。
 * sd.process 返回的 start/end 单位为秒，原样回传，不做采样率换算（见 design.md D4）。
 */
function runDiarizeSd(args) {
  const { wavPath, segmentationModelPath, embeddingModelPath, numThreads } = args;
  const asrParams = args.asrParams || {};

  const sd = new sherpa.OfflineSpeakerDiarization({
    segmentation: { pyannote: { model: segmentationModelPath }, numThreads, debug: 0 },
    embedding: { model: embeddingModelPath, numThreads, debug: 0 },
    // sd 内置 FastClustering 的 threshold 是【距离阈值】(越大簇越少),语义与
    // 快速模式的余弦相似度 speakerClusterThreshold 完全不同,不可混用。
    // 实测(test34,见 design.md):0.5→~90人(过碎),1.2→5人(2主讲+1次要,理想),
    // 1.4→SIGSEGV。默认 1.2;孙进程崩溃由编排器降级到快速模式。
    clustering: { threshold: asrParams.diarizationDistanceThreshold || 1.2 },
    minDurationOn: 1.0,
    minDurationOff: 1.0,
  });

  // enableExternalBuffer=false：见主流程说明（Electron V8 sandbox 限制）。
  const wave = sherpa.readWave(wavPath, false);
  const sdResult = sd.process(wave.samples); // [{start,end,speaker}]，start/end 为秒
  process.stderr.write(`[mem] diarize-sd 孙进程 sd.process 完成 rss=${Math.round(process.memoryUsage().rss / 1048576)}MB\n`);

  const segments = sdResult.map(s => ({ start: s.start, end: s.end, speaker: s.speaker }));
  process.stdout.write(JSON.stringify({ type: 'diarize-sd-result', segments }) + '\n');
}

/**
 * 精确模式编排器（主进程）：spawn 孙进程跑 sd.process → 拿 [{start,end,speaker}]
 * → 加载识别器 → 按说话人段逐段识别（>上限切片喂入，文本拼接，时间戳用原段）
 * → 合并相邻同说话人 → speakerStats。内存峰值 = max(孙 ~4.5GB, 主 ~680MB)（见 design.md D1）。
 * 孙进程异常 → 抛错由上层降级到快速模式（见 design.md D5）。
 */
function runPreciseDiarization(args) {
  const { wavPath, modelDir, modelType, segmentationModelPath, embeddingModelPath, numThreads } = args;
  const asrParams = args.asrParams || {};
  const minSampleLength = asrParams.minSampleLength || 1600;

  send({ type: 'progress', stage: 'initializing', percent: 8 });
  send({ type: 'progress', stage: 'segmenting', percent: 12 });

  // —— 阶段1：孙进程跑 sd.process（主进程此时不加载识别器，内存几乎为零）——
  const childArgs = {
    mode: 'diarize-sd',
    wavPath, segmentationModelPath, embeddingModelPath, numThreads,
    asrParams,
  };
  const proc = spawnSync(process.execPath, [__filename], {
    input: JSON.stringify(childArgs),
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    maxBuffer: 64 * 1024 * 1024,
    encoding: 'utf-8',
  });

  if (proc.status !== 0 || proc.signal) {
    const tail = (proc.stderr || '').slice(-400);
    throw new Error(`precise diarize 孙进程失败 status=${proc.status} signal=${proc.signal} stderrTail=${tail}`);
  }
  process.stderr.write(`[mem] 编排器 孙进程已退出(回收前) rss=${Math.round(process.memoryUsage().rss / 1048576)}MB\n`);

  let sdSegments = null;
  for (const line of (proc.stdout || '').split('\n')) {
    if (!line.trim()) continue;
    try { const m = JSON.parse(line); if (m.type === 'diarize-sd-result') sdSegments = m.segments; } catch (_) { /* skip */ }
  }
  if (!sdSegments) {
    throw new Error(`precise diarize 孙进程无结果 stdoutTail=${(proc.stdout || '').slice(-200)}`);
  }

  // 时间戳对齐校验（见 design.md D4）：sd 返回秒，末段 end 应在音频时长量级，
  // 若出现 ×16000 量级说明单位被误当样本下标，立即告警。
  const lastEnd = sdSegments.length ? sdSegments[sdSegments.length - 1].end : 0;
  process.stderr.write(`[precise-diarization] sdSegments=${sdSegments.length} lastEnd=${lastEnd.toFixed(2)}s\n`);

  // 按说话人段排序（保险）
  sdSegments.sort((a, b) => a.start - b.start);

  send({ type: 'progress', stage: 'recognizing', percent: 40 });

  // —— 阶段2：加载识别器，按说话人段逐段识别（孙进程已退出，内存错峰）——
  const recognizer = createRecognizer(modelDir, modelType, numThreads, asrParams);
  const wave = sherpa.readWave(wavPath, false);
  const sampleRate = wave.sampleRate;
  process.stderr.write(`[mem] 编排器 识别器+wave 已加载 rss=${Math.round(process.memoryUsage().rss / 1048576)}MB\n`);

  // 识别输入安全上限（秒）：超过则切片喂入，文本拼接，时间戳用原说话人段（见 design.md D4）。
  const maxRecSec = asrParams.vadMaxSpeechDuration || 60;
  const maxRecSamples = Math.floor(maxRecSec * sampleRate);

  const items = []; // { start, end, speaker, text }
  for (let i = 0; i < sdSegments.length; i++) {
    const seg = sdSegments[i];
    const startSample = Math.max(0, Math.floor(seg.start * sampleRate));
    const endSample = Math.min(Math.floor(seg.end * sampleRate), wave.samples.length);
    if (endSample - startSample < minSampleLength) continue;

    // 切片识别（仅为识别器输入安全；时间戳仍用原段）
    const pieces = [];
    for (let off = startSample; off < endSample; off += maxRecSamples) {
      const sliceEnd = Math.min(off + maxRecSamples, endSample);
      const samples = wave.samples.slice(off, sliceEnd);
      if (samples.length < minSampleLength) continue;
      try {
        const result = recognizeWave(recognizer, samples, sampleRate);
        const t = String(result.text || '').trim();
        if (t) pieces.push(t);
      } catch (segErr) {
        process.stderr.write(`[precise-seg-error] index=${i} off=${off} err=${segErr && segErr.stack ? segErr.stack : String(segErr)}\n`);
      }
    }
    const text = pieces.join('');
    if (!text) continue;

    items.push({
      start: Math.round(seg.start * 100) / 100,
      end: Math.round(seg.end * 100) / 100,
      speaker: `Speaker ${seg.speaker + 1}`,
      text,
    });

    const progress = 40 + Math.floor((i + 1) / sdSegments.length * 55);
    send({ type: 'progress', stage: 'recognizing', percent: progress });
  }

  // 合并相邻同说话人段（间隔 < sameSpeakerMergeGap，文本换行拼接，时间区间取并集）
  const mergeGap = asrParams.sameSpeakerMergeGap || 2.0;
  const merged = [];
  for (const it of items) {
    const last = merged[merged.length - 1];
    if (last && last.speaker === it.speaker && it.start - last.end < mergeGap) {
      last.text += '\n' + it.text;
      last.end = it.end;
    } else {
      merged.push({ ...it });
    }
  }

  const segments = [];
  const speakerStats = {};
  for (const m of merged) {
    segments.push({ text: m.text, start: m.start, end: m.end, speaker: m.speaker });
    if (!speakerStats[m.speaker]) speakerStats[m.speaker] = { segments: 0, duration: 0 };
    speakerStats[m.speaker].segments++;
    speakerStats[m.speaker].duration += m.end - m.start;
  }
  for (const key of Object.keys(speakerStats)) {
    speakerStats[key].duration = Math.round(speakerStats[key].duration * 100) / 100;
  }

  const fullText = segments.map(s => s.text).join('\n');
  send({ type: 'progress', stage: 'done', percent: 100 });
  send({ type: 'result', text: fullText, segments, speakerStats, keywords: extractKeywords(fullText), lang: 'zh', strategy: 'speaker-diarization' });
}

/**
 * 快速模式入口 + 降级：快速模式失败 → runWithVAD（无标签兜底）。
 * （精确模式 runDiarization/runPreciseDiarization 已实现但暂不接入，见入口处说明。）
 */
async function runFastDiarizationWithFallback(args, hasVAD) {
  try {
    await runFastDiarization(args);
  } catch (err) {
    process.stderr.write(`[fast-fallback-to-vad] err=${err && err.stack ? err.stack : String(err)}\n`);
    if (!hasVAD) throw err;
    send({ type: 'progress', stage: 'fallback-vad', percent: 18 });
    runWithVAD(args);
  }
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

  // enableExternalBuffer=false：见 runFastDiarization 处说明（Electron V8 sandbox 限制）。
  const wave = sherpa.readWave(wavPath, false);

  // 逐窗口送入 VAD
  const windowSize = 512;
  for (let i = 0; i + windowSize <= wave.samples.length; i += windowSize) {
    const chunk = wave.samples.slice(i, i + windowSize);
    vad.acceptWaveform(chunk);
  }
  vad.flush();

  // 收集所有语音段（front(false)：同样避免外部 buffer）
  const speechSegments = [];
  while (!vad.isEmpty()) {
    speechSegments.push(vad.front(false));
    vad.pop();
  }

  send({ type: 'progress', stage: 'recognizing', percent: 40 });

  const segments = [];
  const minSampleLength = asrParams.minSampleLength || 1600;

  for (let i = 0; i < speechSegments.length; i++) {
    const seg = speechSegments[i];
    // sherpa SpeechSegment.start 是样本下标（int32），换算到秒得到全局时间轴。
    const startSec = seg.start / 16000;
    const start = Math.round(startSec * 100) / 100;
    const samples = seg.samples;

    if (samples.length < minSampleLength) continue;

    const duration = samples.length / 16000;
    const end = Math.round((startSec + duration) * 100) / 100;

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

  // enableExternalBuffer=false：见 runFastDiarization 处说明（Electron V8 sandbox 限制）。
  const wave = sherpa.readWave(wavPath, false);
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
process.stdin.on('end', async () => {
  let stage = 'parse-args';
  let args;
  try {
    args = JSON.parse(inputData);

    // 注：精确模式（pyannote sd.process，孙进程隔离）整套已实现但【暂不接入】。
    // 原因：sd.process 在 macOS/Apple Silicon 上经 onnxruntime ArmKleidiAI 卷积内核
    // 反复 Compute 时 arena 累积，峰值可顶爆系统内存甚至 SIGSEGV（实测 thr=1.4 必崩）。
    // 风险不适合做进系统，故仅保留快速模式这一条线。相关函数（runDiarizeSd /
    // runPreciseDiarization / runDiarization）保留备用，不在入口路由。
    // if (args.mode === 'diarize-sd') { stage = 'diarize-sd'; runDiarizeSd(args); return; }

    stage = 'select-strategy';
    const hasEmbedding = args.embeddingModelPath && fs.existsSync(args.embeddingModelPath);
    const hasVAD = args.vadModelPath && fs.existsSync(args.vadModelPath);

    process.stderr.write(`[strategy-decision] hasEmbedding=${hasEmbedding} hasVAD=${hasVAD} forceStrategy=${args.forceStrategy || ''}\n`);

    // 父进程检测到上一轮原生崩溃后会带 forceStrategy='vad' 重跑：强制走无说话人 VAD（最外层安全网）。
    if (args.forceStrategy === 'vad' && hasVAD) {
      stage = 'vad';
      runWithVAD(args);
    } else if (hasVAD && hasEmbedding) {
      stage = 'diarization-fast';
      await runFastDiarizationWithFallback(args, hasVAD); // 快速模式（embedding 走 onnxruntime，async），失败降级 vad
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
