const DASHSCOPE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'

interface LLMSettings {
  llmProvider?: string
  llmModel?: string
  llmApiKey?: string
}

async function callOnce(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const resp = await fetch(DASHSCOPE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  })

  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`API 请求失败 (${resp.status}): ${body}`)
  }

  const data = await resp.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('API 返回内容为空')
  }

  return content
}

/** 尝试解析 JSON，支持去除 markdown 代码块标记 */
function tryParseJSON(raw: string): any {
  let s = raw.trim()
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
  }
  return JSON.parse(s)
}

/**
 * 调用 LLM，自动重试最多 maxRetries 次（JSON 解析失败时重试）
 */
export async function callLLM(
  settings: LLMSettings,
  systemPrompt: string,
  userPrompt: string,
  maxRetries: number = 3
): Promise<string> {
  const apiKey = settings.llmApiKey
  if (!apiKey) {
    throw new Error('请先在设置中配置 API Key')
  }

  const model = settings.llmModel || 'qwen3-max'

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const raw = await callOnce(apiKey, model, systemPrompt, userPrompt)

      // 验证 JSON 可解析
      tryParseJSON(raw)

      // 解析成功，返回原始字符串（前端负责解析和渲染）
      return raw
    } catch (err: any) {
      lastError = err
      // API 错误（非 JSON 解析问题）不重试
      if (err.message?.includes('API 请求失败') || err.message?.includes('API 返回内容为空')) {
        throw err
      }
      console.warn(`LLM JSON parse failed (attempt ${attempt}/${maxRetries}):`, err.message)
      if (attempt < maxRetries) continue
    }
  }

  throw new Error(`AI 分析失败：多次尝试后仍无法获取有效结果`)
}
