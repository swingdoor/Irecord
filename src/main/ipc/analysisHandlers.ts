import { ipcMain, dialog } from 'electron'
import { writeFile } from 'fs/promises'
import { getSettings } from '../utils/settings'
import { callLLM } from '../llm/client'
import { getSummaryPrompt, getSpeakersPrompt, getMinutesPrompt, getQaPrompt, getAskPrompt } from '../llm/prompts'
import { updateResultAnalysis } from '../db/database'
import { logError } from '../utils/errorHandler'

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function registerAnalysisHandlers(): void {
  // LLM 分析
  ipcMain.handle('llm-analyze', async (_event, params: {
    type: 'summary' | 'speakers' | 'minutes' | 'qa' | 'ask'
    text: string
    segments?: Array<{ text: string; start: number; end: number; speaker?: string }>
    question?: string
  }) => {
    try {
      const settings = getSettings()

      let prompt: { system: string; user: string }
      switch (params.type) {
        case 'summary':
          prompt = getSummaryPrompt(params.text)
          break
        case 'speakers':
          prompt = getSpeakersPrompt(params.text, params.segments)
          break
        case 'minutes':
          prompt = getMinutesPrompt(params.text)
          break
        case 'qa':
          prompt = getQaPrompt(params.text)
          break
        case 'ask':
          if (!params.question) return { error: '请输入问题' }
          prompt = getAskPrompt(params.text, params.question)
          break
        default:
          return { error: '未知分析类型' }
      }

      const result = await callLLM(settings, prompt.system, prompt.user)
      return { result }
    } catch (err: unknown) {
      logError('llm-analyze', err)
      const message = err instanceof Error ? err.message : '分析失败'
      return { error: message }
    }
  })

  // 更新 AI 分析结果到数据库
  ipcMain.handle('update-ai-analysis', async (_event, params: {
    taskId: string
    field: 'aiSummary' | 'aiSpeakers' | 'aiMinutes' | 'aiQa'
    value: string
  }) => {
    try {
      await updateResultAnalysis(params.taskId, params.field, params.value)
      return { success: true }
    } catch (err: any) {
      logError('update-ai-analysis', err)
      return { error: err.message || '更新失败' }
    }
  })

  // 导出 TXT 文件
  ipcMain.handle('export-txt', async (_event, options: {
    text: string
    includeTimestamps: boolean
    segments?: Array<{ text: string; start: number; end: number; speaker?: string }>
    keywords?: Array<{ word: string; score: number }>
  }) => {
    const result = await dialog.showSaveDialog({
      title: '导出转写结果',
      defaultPath: 'transcription.txt',
      filters: [{ name: '文本文件', extensions: ['txt'] }]
    })

    if (result.canceled || !result.filePath) return { canceled: true }

    try {
      let content = ''

      if (options.keywords?.length) {
        content += '关键词：' + options.keywords.map(k => k.word).join('、') + '\n\n'
      }

      if (options.includeTimestamps && options.segments?.length) {
        content += options.segments
          .map(seg => {
            const time = `[${formatTimestamp(seg.start)} - ${formatTimestamp(seg.end)}]`
            const speaker = seg.speaker ? ` ${seg.speaker}:` : ''
            return `${time}${speaker} ${seg.text}`
          })
          .join('\n')
      } else {
        content += options.text
      }

      await writeFile(result.filePath, content, 'utf-8')
      return { filePath: result.filePath }
    } catch (err: any) {
      logError('export-txt', err)
      return { error: `导出失败: ${err.message}` }
    }
  })
}
