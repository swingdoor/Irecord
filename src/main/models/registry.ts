export interface ModelEntry {
  id: string
  name: string
  description: string
  category: 'asr' | 'auxiliary'
  folderName: string
  requiredFiles: string[]
  size: number // bytes
  downloadUrl?: string
  bundled: boolean
}

export const MODEL_REGISTRY: ModelEntry[] = [
  {
    id: 'sensevoice-small',
    name: 'SenseVoice Small',
    description: '轻量快速，支持中英日韩粤语',
    category: 'asr',
    folderName: 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17',
    requiredFiles: ['model.int8.onnx', 'tokens.txt'],
    size: 239_549_735,
    bundled: true,
  },
  {
    id: 'qwen3-asr',
    name: 'Qwen3-ASR 0.6B',
    description: '高精度离线转写，效果最佳',
    category: 'asr',
    folderName: 'sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25',
    requiredFiles: ['encoder.int8.onnx', 'decoder.int8.onnx'],
    size: 987_015_675,
    downloadUrl: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25.tar.bz2',
    bundled: false,
  },
  {
    id: 'silero-vad',
    name: 'Silero VAD',
    description: '语音活动检测',
    category: 'auxiliary',
    folderName: 'silero-vad',
    requiredFiles: ['silero_vad.onnx'],
    size: 644_513,
    bundled: true,
  },
  {
    id: 'speaker-diarization',
    name: '说话人分离',
    description: '多人对话区分说话人',
    category: 'auxiliary',
    folderName: 'speaker-diarization',
    requiredFiles: ['pyannote_segmentation.onnx', '3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx'],
    size: 45_587_818,
    bundled: true,
  },
]

export function getModelEntry(modelId: string): ModelEntry | undefined {
  return MODEL_REGISTRY.find((m) => m.id === modelId)
}
