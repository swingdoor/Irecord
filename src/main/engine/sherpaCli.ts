import { spawn, execFile, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { cpus } from 'os'
import { randomUUID } from 'crypto'
import {
  checkDiarizationModelsExist,
  checkSherpaCliRuntime,
  getEmbeddingModelPath,
  getQwen3AsrModelPath,
  getSegmentationModelPath,
  getSenseVoiceModelPath,
  getSherpaCliPath,
  getVadModelPath,
} from '../utils/paths'
import { convertToWav } from '../audio/ffmpeg'
import { deleteTempFile, getTempDir } from '../audio/temp'
import { type AsrParams } from '../utils/settings'

export interface SpeakerSegment {
  start: number
  end: number
  speaker: string
}

export interface TranscriptSegment extends SpeakerSegment {
  text: string
}

export interface SherpaCliResult {
  text: string
  segments: TranscriptSegment[]
  speakerStats?: Record<string, { segments: number; duration: number }>
  keywords: Array<{ word: string; score: number }>
  lang: string
  strategy: 'speaker-diarization' | 'vad'
}

export interface SherpaCliOptions {
  wavPath: string
  modelType: string
  strategy?: string
  asrParams: AsrParams
  onProcess?: (proc: ChildProcess | null) => void
  onProgress?: (stage: string, percent: number) => void
  writeLog?: (tag: string, payload: unknown) => void
}

interface CommandResult {
  stdout: string
  stderr: string
  elapsedMs: number
  peakRssMb?: number
}

function commandFailureMessage(command: string, stderr: string, code: number | null, signal: NodeJS.Signals | null): string {
  if (signal) return `${command} 被信号 ${signal} 终止（疑似原生进程崩溃）`
  const lines = stderr.split('\n').map((line) => line.trim()).filter(Boolean)
  const tail = lines.slice(-8).join('\n')
  return tail || `${command} 退出，代码: ${code}`
}

function sampleRssMb(pid: number): Promise<number | undefined> {
  if (process.platform === 'win32') return Promise.resolve(undefined)
  return new Promise((resolve) => {
    execFile('ps', ['-o', 'rss=', '-p', String(pid)], (err, stdout) => {
      if (err) {
        resolve(undefined)
        return
      }
      const rssKb = Number(stdout.trim())
      resolve(Number.isFinite(rssKb) && rssKb > 0 ? rssKb / 1024 : undefined)
    })
  })
}

function runCli(
  command: string,
  args: string[],
  options: Pick<SherpaCliOptions, 'onProcess' | 'writeLog'>
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const proc = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let peakRssMb = 0
    let rssTimer: NodeJS.Timeout | null = null

    options.onProcess?.(proc)
    options.writeLog?.('cli-spawn', {
      command,
      argCount: args.length,
      args: args.length > 20 ? [...args.slice(0, 12), `... ${args.length - 16} args omitted ...`, ...args.slice(-4)] : args,
    })

    if (proc.pid) {
      rssTimer = setInterval(() => {
        sampleRssMb(proc.pid!).then((rss) => {
          if (rss && rss > peakRssMb) peakRssMb = rss
        }).catch(() => {})
      }, 1000)
    }

    proc.stdout?.on('data', (chunk) => {
      const text = chunk.toString()
      stdout += text
      options.writeLog?.('cli-stdout', text.replace(/\n+$/, ''))
    })
    proc.stderr?.on('data', (chunk) => {
      const text = chunk.toString()
      stderr += text
      options.writeLog?.('cli-stderr', text.replace(/\n+$/, ''))
    })
    proc.on('error', (err) => {
      if (rssTimer) clearInterval(rssTimer)
      options.onProcess?.(null)
      options.writeLog?.('cli-spawn-error', { command, message: err.message, stack: err.stack })
      reject(err)
    })
    proc.on('close', (code, signal) => {
      if (rssTimer) clearInterval(rssTimer)
      options.onProcess?.(null)
      const elapsedMs = Date.now() - startedAt
      const result = { command, code, signal, elapsedMs, peakRssMb: peakRssMb ? Math.round(peakRssMb * 10) / 10 : undefined }
      options.writeLog?.('cli-close', result)
      if (code === 0) {
        resolve({ stdout, stderr, elapsedMs, peakRssMb: result.peakRssMb })
        return
      }
      reject(new Error(commandFailureMessage(command, stderr, code, signal)))
    })
  })
}

export function parseDiarizationOutput(stdout: string): SpeakerSegment[] {
  const segments: SpeakerSegment[] = []
  const pattern = /^\s*(\d+(?:\.\d+)?)\s+--\s+(\d+(?:\.\d+)?)\s+speaker_([A-Za-z0-9_-]+)\s*$/
  for (const line of stdout.split('\n')) {
    const match = line.match(pattern)
    if (!match) continue
    const start = Number(match[1])
    const end = Number(match[2])
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    segments.push({
      start: Math.round(start * 100) / 100,
      end: Math.round(end * 100) / 100,
      speaker: `speaker_${match[3]}`,
    })
  }
  return segments
}

export function parseVadOutput(output: string): SpeakerSegment[] {
  const segments: SpeakerSegment[] = []
  const pattern = /^\s*(\d+(?:\.\d+)?)\s+--\s+(\d+(?:\.\d+)?)\s*$/
  for (const line of output.split('\n')) {
    const match = line.match(pattern)
    if (!match) continue
    const start = Number(match[1])
    const end = Number(match[2])
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    segments.push({ start: roundSeconds(start), end: roundSeconds(end), speaker: 'speaker_00' })
  }
  return segments
}

function mergeSpeakerSegments(segments: SpeakerSegment[], maxGapSeconds: number): SpeakerSegment[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start || a.end - b.end)
  const merged: SpeakerSegment[] = []
  for (const seg of sorted) {
    const last = merged[merged.length - 1]
    if (last && last.speaker === seg.speaker && seg.start - last.end <= maxGapSeconds) {
      last.end = Math.max(last.end, seg.end)
    } else {
      merged.push({ ...seg })
    }
  }
  return merged
}

function extractAsrJsonLines(stdout: string): Array<Record<string, any>> {
  const messages: Array<Record<string, any>> = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) continue
    try {
      messages.push(JSON.parse(trimmed))
    } catch (err: any) {
      // The caller logs stdout in full; keep parsing tolerant.
    }
  }
  return messages
}

function sanitizeAsrText(text: string): string {
  return text
    .replace(/<\|[^|]+?\|>/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function resolveCliThreads(asrParams: AsrParams): number {
  return Math.max(1, Math.min(cpus().length, Math.floor(asrParams.cliNumThreads || 4)))
}

function resolveAsrBatchSize(asrParams: AsrParams): number {
  return Math.max(1, Math.min(4, Math.floor(asrParams.asrBatchSize || 2)))
}

function resolveSenseVoiceLanguage(asrParams: AsrParams): string {
  const language = String(asrParams.senseVoiceLanguage || 'zh')
  return ['auto', 'zh', 'en', 'ja', 'ko', 'yue'].includes(language) ? language : 'zh'
}

function getAsrArgs(modelType: string, modelDir: string, asrParams: AsrParams, wavPaths: string[]): string[] {
  const threads = resolveCliThreads(asrParams)
  const common = ['--provider=cpu', `--num-threads=${threads}`]
  if (modelType === 'sensevoice-small') {
    return [
      `--tokens=${join(modelDir, 'tokens.txt')}`,
      `--sense-voice-model=${join(modelDir, 'model.int8.onnx')}`,
      `--sense-voice-language=${resolveSenseVoiceLanguage(asrParams)}`,
      '--sense-voice-use-itn=true',
      ...common,
      ...wavPaths,
    ]
  }

  const args = [
    `--qwen3-asr-encoder=${join(modelDir, 'encoder.int8.onnx')}`,
    `--qwen3-asr-decoder=${join(modelDir, 'decoder.int8.onnx')}`,
    `--qwen3-asr-tokenizer=${modelDir}`,
    `--qwen3-asr-max-total-len=${asrParams.qwen3MaxTotalLen}`,
    `--qwen3-asr-max-new-tokens=${asrParams.qwen3MaxNewTokens}`,
    ...common,
  ]
  const convFrontend = join(modelDir, 'conv_frontend.int8.onnx')
  if (existsSync(convFrontend)) args.unshift(`--qwen3-asr-conv-frontend=${convFrontend}`)
  return [...args, ...wavPaths]
}

async function runDiarization(options: SherpaCliOptions): Promise<SpeakerSegment[]> {
  const threshold = options.asrParams.diarizationDistanceThreshold || 1.2
  const threads = resolveCliThreads(options.asrParams)
  const args = [
    `--segmentation.pyannote-model=${getSegmentationModelPath()}`,
    `--embedding.model=${getEmbeddingModelPath()}`,
    '--segmentation.provider=cpu',
    '--embedding.provider=cpu',
    `--segmentation.num-threads=${threads}`,
    `--embedding.num-threads=${threads}`,
    `--clustering.cluster-threshold=${threshold}`,
    options.wavPath,
  ]
  const result = await runCli(getSherpaCliPath('diarization'), args, options)
  const segments = parseDiarizationOutput(result.stdout)
  options.writeLog?.('diarization-result', { count: segments.length, elapsedMs: result.elapsedMs, peakRssMb: result.peakRssMb })
  return mergeSpeakerSegments(segments, options.asrParams.sameSpeakerMergeGap || 2)
}

async function runVadSegmentation(options: SherpaCliOptions): Promise<SpeakerSegment[]> {
  const threshold = Math.max(0.1, Math.min(1, Number(options.asrParams.vadThreshold || 0.5)))
  const minSilence = Math.max(0.1, Number(options.asrParams.minSilenceDuration || 1.5))
  const minSpeech = Math.max(0.1, Number(options.asrParams.minSpeechDuration || 1))
  const maxSpeech = Math.max(minSpeech, Number(options.asrParams.vadMaxSpeechDuration || options.asrParams.maxAsrSegmentDuration || 60))
  const outputWav = join(getTempDir(), `vad-${randomUUID()}.wav`)
  const args = [
    `--silero-vad-model=${getVadModelPath()}`,
    `--silero-vad-threshold=${threshold}`,
    `--silero-vad-min-silence-duration=${minSilence}`,
    `--silero-vad-min-speech-duration=${minSpeech}`,
    `--silero-vad-max-speech-duration=${maxSpeech}`,
    `--vad-num-threads=${resolveCliThreads(options.asrParams)}`,
    options.wavPath,
    outputWav,
  ]
  try {
    const result = await runCli(getSherpaCliPath('vad'), args, options)
    const segments = parseVadOutput(`${result.stdout}\n${result.stderr}`)
    options.writeLog?.('vad-result', {
      count: segments.length,
      threshold,
      minSilence,
      minSpeech,
      maxSpeech,
      elapsedMs: result.elapsedMs,
      peakRssMb: result.peakRssMb,
    })
    return segments
  } finally {
    deleteTempFile(outputWav)
  }
}

function roundSeconds(value: number): number {
  return Math.round(value * 100) / 100
}

function prepareAsrSegments(segments: SpeakerSegment[], asrParams: AsrParams, writeLog?: SherpaCliOptions['writeLog']): SpeakerSegment[] {
  const minDuration = Math.max(0, Number(asrParams.minAsrSegmentDuration || 0.8))
  const maxDuration = Math.max(minDuration, Number(asrParams.maxAsrSegmentDuration || 60))
  const prepared: SpeakerSegment[] = []
  let droppedShort = 0
  let splitSegments = 0

  for (const seg of segments) {
    const duration = seg.end - seg.start
    if (!Number.isFinite(duration) || duration < minDuration) {
      droppedShort += 1
      continue
    }

    const partCount = Math.max(1, Math.ceil(duration / maxDuration))
    if (partCount > 1) splitSegments += 1
    const partDuration = duration / partCount

    for (let i = 0; i < partCount; i += 1) {
      const start = roundSeconds(seg.start + i * partDuration)
      const end = roundSeconds(i === partCount - 1 ? seg.end : seg.start + (i + 1) * partDuration)
      if (end - start < minDuration) {
        droppedShort += 1
        continue
      }
      prepared.push({ start, end, speaker: seg.speaker })
    }
  }

  writeLog?.('asr-segment-prepare', {
    inputCount: segments.length,
    outputCount: prepared.length,
    droppedShort,
    splitSegments,
    minDuration,
    maxDuration,
  })

  return prepared
}

async function makeAsrChunks(wavPath: string, segments: SpeakerSegment[], options: SherpaCliOptions): Promise<string[]> {
  const chunkPaths: string[] = []
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i]
    options.onProgress?.('chunking', Math.min(55, 35 + Math.round((i / Math.max(1, segments.length)) * 20)))
    const chunk = await convertToWav(wavPath, {
      startSeconds: seg.start,
      durationSeconds: seg.end - seg.start,
      onProcess: options.onProcess,
      onStderr: (text) => options.writeLog?.('ffmpeg-chunk-stderr', text.replace(/\n+$/, '')),
    })
    chunkPaths.push(chunk)
  }
  return chunkPaths
}

async function runAsr(modelType: string, wavPaths: string[], options: SherpaCliOptions): Promise<string[]> {
  const modelDir = modelType === 'sensevoice-small' ? getSenseVoiceModelPath() : getQwen3AsrModelPath()
  const texts: string[] = []
  const peakRssValues: number[] = []
  let elapsedTotalMs = 0
  const batchSize = resolveAsrBatchSize(options.asrParams)

  for (let i = 0; i < wavPaths.length; i += batchSize) {
    const batch = wavPaths.slice(i, i + batchSize)
    if (wavPaths.length > 1) {
      const percent = 60 + Math.round((i / wavPaths.length) * 35)
      options.onProgress?.('asr', Math.min(95, percent))
    }

    const result = await runCli(getSherpaCliPath('offline'), getAsrArgs(modelType, modelDir, options.asrParams, batch), options)
    const messages = extractAsrJsonLines(result.stdout)
    for (let j = 0; j < batch.length; j += 1) {
      texts.push(sanitizeAsrText(String(messages[j]?.text || '')))
    }
    elapsedTotalMs += result.elapsedMs
    if (typeof result.peakRssMb === 'number') peakRssValues.push(result.peakRssMb)
    options.writeLog?.('asr-batch-result', {
      startIndex: i + 1,
      endIndex: i + batch.length,
      total: wavPaths.length,
      batchSize: batch.length,
      jsonCount: messages.length,
      elapsedMs: result.elapsedMs,
      peakRssMb: result.peakRssMb,
    })
  }

  options.writeLog?.('asr-result', {
    wavCount: wavPaths.length,
    elapsedTotalMs,
    peakRssMb: peakRssValues.length ? Math.max(...peakRssValues) : undefined,
    mode: 'batched',
    batchSize,
  })
  return texts
}

function buildSpeakerStats(segments: TranscriptSegment[]): Record<string, { segments: number; duration: number }> {
  const stats: Record<string, { segments: number; duration: number }> = {}
  for (const seg of segments) {
    if (!stats[seg.speaker]) stats[seg.speaker] = { segments: 0, duration: 0 }
    stats[seg.speaker].segments += 1
    stats[seg.speaker].duration += Math.max(0, seg.end - seg.start)
  }
  for (const key of Object.keys(stats)) {
    stats[key].duration = Math.round(stats[key].duration * 100) / 100
  }
  return stats
}

function extractKeywordsSafe(text: string): Array<{ word: string; score: number }> {
  try {
    const candidates = [
      join(process.resourcesPath || '', 'extract.js'),
      join(__dirname, '../keywords/extract.js'),
      join(process.cwd(), 'src/main/keywords/extract.js'),
    ]
    for (const path of candidates) {
      if (!existsSync(path)) continue
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { extractKeywords } = require(path)
      return extractKeywords(text)
    }
  } catch {
  }
  return []
}

export async function recognizeWithSherpaCli(options: SherpaCliOptions): Promise<SherpaCliResult> {
  const runtime = checkSherpaCliRuntime()
  if (!runtime.available) {
    throw new Error(`Sherpa CLI 运行时不可用: ${runtime.missing.map((m) => `${m.kind}:${m.reason}:${m.path}`).join('; ')}`)
  }

  const requestedStrategy: SherpaCliResult['strategy'] = options.strategy === 'vad' ? 'vad' : 'speaker-diarization'
  let resultStrategy: SherpaCliResult['strategy'] = requestedStrategy
  let recognitionSegments: SpeakerSegment[] = []

  if (requestedStrategy === 'speaker-diarization' && checkDiarizationModelsExist()) {
    try {
      options.onProgress?.('diarization', 20)
      recognitionSegments = await runDiarization(options)
    } catch (err: any) {
      options.writeLog?.('diarization-fallback', { message: err.message, stack: err.stack })
      resultStrategy = 'vad'
      options.onProgress?.('vad', 20)
      recognitionSegments = await runVadSegmentation(options)
    }
  } else if (requestedStrategy === 'speaker-diarization') {
    options.writeLog?.('diarization-fallback', { message: 'diarization models missing' })
    resultStrategy = 'vad'
    options.onProgress?.('vad', 20)
    recognitionSegments = await runVadSegmentation(options)
  } else {
    options.onProgress?.('vad', 20)
    recognitionSegments = await runVadSegmentation(options)
  }

  const tempChunks: string[] = []
  try {
    const hadSegments = recognitionSegments.length > 0
    recognitionSegments = prepareAsrSegments(recognitionSegments, options.asrParams, options.writeLog)

    if (recognitionSegments.length > 0) {
      const chunks = await makeAsrChunks(options.wavPath, recognitionSegments, options)
      tempChunks.push(...chunks)
      options.onProgress?.('asr', 60)
      const texts = await runAsr(options.modelType, chunks, options)
      const segments = recognitionSegments.map((seg, index) => ({
        ...seg,
        text: texts[index] || '',
      })).filter((seg) => seg.text)
      const text = segments.map((seg) => seg.text).filter(Boolean).join('\n')
      return {
        text,
        segments,
        speakerStats: resultStrategy === 'speaker-diarization' ? buildSpeakerStats(segments) : undefined,
        keywords: extractKeywordsSafe(text),
        lang: 'zh',
        strategy: resultStrategy,
      }
    }

    if (hadSegments) {
      options.writeLog?.('asr-skip', { message: 'all segments shorter than minAsrSegmentDuration' })
      return {
        text: '',
        segments: [],
        speakerStats: resultStrategy === 'speaker-diarization' ? {} : undefined,
        keywords: [],
        lang: 'zh',
        strategy: resultStrategy,
      }
    }

    return {
      text: '',
      segments: [],
      speakerStats: undefined,
      keywords: [],
      lang: 'zh',
      strategy: resultStrategy,
    }
  } finally {
    for (const chunk of tempChunks) deleteTempFile(chunk)
  }
}
