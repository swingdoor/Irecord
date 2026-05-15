export interface LLMProviderModel {
  id: string
  name: string
}

export interface LLMProvider {
  id: string
  name: string
  baseUrl: string
  models: LLMProviderModel[]
}

export const PROVIDERS: Record<string, LLMProvider> = {
  dashscope: {
    id: 'dashscope',
    name: '阿里百炼（DashScope）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      { id: 'qwen3-max', name: 'Qwen3-Max' },
      { id: 'qwen3.6-plus', name: 'Qwen3.6-Plus' },
      { id: 'qwen3.5-flash', name: 'Qwen3.5-Flash' },
    ],
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
    ],
  },
}

export function getProvider(id: string): LLMProvider | undefined {
  return PROVIDERS[id]
}

export function getProviderList(): LLMProvider[] {
  return Object.values(PROVIDERS)
}
