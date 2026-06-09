import { MODEL_REGISTRY } from './registry'
import { getModelStatus } from './status'

export interface EngineEntry {
  id: string
  name: string
  type: 'offline'
  description: string
  models: string[] // model ids from registry
}

export const ENGINE_REGISTRY: EngineEntry[] = [
  {
    id: 'sensevoice-offline',
    name: 'SenseVoice Small（轻量快速）',
    type: 'offline',
    description: '轻量快速，支持中英日韩粤语',
    models: ['sensevoice-small', 'silero-vad', 'speaker-diarization'],
  },
  {
    id: 'qwen3-asr-offline',
    name: 'Qwen3-ASR 0.6B（高精度）',
    type: 'offline',
    description: '高精度离线转写，效果最佳',
    models: ['qwen3-asr', 'silero-vad', 'speaker-diarization'],
  },
]

export interface EngineWithAvailability extends EngineEntry {
  available: boolean
}

export function getEngineAvailability(): EngineWithAvailability[] {
  return ENGINE_REGISTRY.map((engine) => {
    const available = engine.models.every((modelId) => {
      const entry = MODEL_REGISTRY.find((m) => m.id === modelId)
      if (!entry) return false
      return getModelStatus(entry).status === 'installed'
    })
    return { ...engine, available }
  })
}

/** 文件转写模型 id 去重集合 */
export function getOfflineModelIds(): string[] {
  const ids = new Set<string>()
  for (const e of ENGINE_REGISTRY) {
    if (e.type === 'offline') e.models.forEach((id) => ids.add(id))
  }
  return [...ids]
}

/** 辅助模型 = 在注册表中但不作为用户可选 ASR 的模型 */
const AUXILIARY_MODEL_IDS = ['silero-vad', 'speaker-diarization']

export function getOfflineModels() {
  const ids = getOfflineModelIds().filter((id) => !AUXILIARY_MODEL_IDS.includes(id))
  return MODEL_REGISTRY.filter((m) => ids.includes(m.id))
}

export function getAuxiliaryModels() {
  return MODEL_REGISTRY.filter((m) => AUXILIARY_MODEL_IDS.includes(m.id))
}
