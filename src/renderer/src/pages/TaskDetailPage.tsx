import { useState, useCallback, useEffect } from 'react'
import { ArrowLeft, Copy, Download, Check } from 'lucide-react'
import { useAppStore, TaskResultData } from '../stores/appStore'

const SPEAKER_COLORS = [
  'text-blue-700 bg-blue-50 border-blue-200',
  'text-emerald-700 bg-emerald-50 border-emerald-200',
  'text-orange-700 bg-orange-50 border-orange-200',
  'text-purple-700 bg-purple-50 border-purple-200',
  'text-rose-700 bg-rose-50 border-rose-200',
  'text-cyan-700 bg-cyan-50 border-cyan-200',
  'text-amber-700 bg-amber-50 border-amber-200',
  'text-indigo-700 bg-indigo-50 border-indigo-200',
]

const SPEAKER_DOT_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-orange-500', 'bg-purple-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-amber-500', 'bg-indigo-500',
]

function getSpeakerColorIndex(speaker: string, speakerList: string[]): number {
  const idx = speakerList.indexOf(speaker)
  return idx >= 0 ? idx % SPEAKER_COLORS.length : 0
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`
}

function getStrategyLabel(strategy?: string): string {
  switch (strategy) {
    case 'speaker-diarization': return '说话人分离'
    case 'vad': return 'VAD 分段'
    case 'plain': return '整体识别'
    default: return '未知'
  }
}

// 高亮文本中的关键词
function HighlightText({ text, keyword }: { text: string; keyword: string | null }) {
  if (!keyword) return <>{text}</>

  const parts: Array<{ text: string; highlight: boolean }> = []
  let remaining = text
  const lowerKeyword = keyword.toLowerCase()

  while (remaining.length > 0) {
    const idx = remaining.toLowerCase().indexOf(lowerKeyword)
    if (idx === -1) {
      parts.push({ text: remaining, highlight: false })
      break
    }
    if (idx > 0) parts.push({ text: remaining.slice(0, idx), highlight: false })
    parts.push({ text: remaining.slice(idx, idx + keyword.length), highlight: true })
    remaining = remaining.slice(idx + keyword.length)
  }

  return (
    <>
      {parts.map((part, i) =>
        part.highlight
          ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">{part.text}</mark>
          : <span key={i}>{part.text}</span>
      )}
    </>
  )
}

export default function TaskDetailPage() {
  const { currentTaskId, setPage, currentResult, setCurrentResult, currentTask, setCurrentTask } = useAppStore()
  const [copied, setCopied] = useState(false)
  const [showTimestamps, setShowTimestamps] = useState(true)
  const [activeKeyword, setActiveKeyword] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentTaskId) { setPage('taskList'); return }

    const loadResult = async () => {
      setLoading(true)
      const data = await window.electronAPI.getTaskResult(currentTaskId)
      if (data.error) {
        setPage('taskList')
        return
      }
      setCurrentTask(data.task)
      setCurrentResult(data.result)
      setLoading(false)
    }
    loadResult()
  }, [currentTaskId, setPage, setCurrentResult, setCurrentTask])

  const result = currentResult
  const task = currentTask

  const hasTimestamps = !!(result?.segments && result.segments.length > 0)
  const hasSpeakers = hasTimestamps && result!.segments!.some(s => s.speaker)
  const hasKeywords = !!(result?.keywords && result.keywords.length > 0)
  const speakerList = hasSpeakers
    ? [...new Set(result!.segments!.map(s => s.speaker).filter(Boolean) as string[])]
    : []

  const handleCopy = useCallback(async () => {
    if (!result) return
    await navigator.clipboard.writeText(result.text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [result])

  const handleExport = useCallback(async () => {
    if (!result) return
    const res = await window.electronAPI.exportTxt({
      text: result.text,
      includeTimestamps: hasTimestamps && showTimestamps,
      segments: result.segments,
      keywords: result.keywords,
    })
    if (res.error) alert(res.error)
  }, [result, hasTimestamps, showTimestamps])

  const handleBack = useCallback(() => {
    setCurrentResult(null)
    setCurrentTask(null)
    setPage('taskList')
  }, [setPage, setCurrentResult, setCurrentTask])

  if (loading || !result || !task) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">加载中...</p>
      </div>
    )
  }

  const wordCount = result.text.replace(/\s/g, '').length

  return (
    <div className="min-h-screen flex flex-col p-6">
      {/* 顶部栏 */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={handleBack} className="flex items-center gap-1.5 text-gray-600 hover:text-gray-800 transition-colors">
          <ArrowLeft className="w-4 h-4" /><span>返回</span>
        </button>
        <div className="flex items-center gap-2">
          {hasTimestamps && (
            <button onClick={() => setShowTimestamps(!showTimestamps)} className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              {showTimestamps ? '隐藏时间戳' : '显示时间戳'}
            </button>
          )}
          <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            {copied ? '已复制' : '复制全部'}
          </button>
          <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Download className="w-4 h-4" />导出 TXT
          </button>
        </div>
      </div>

      {/* 摘要信息 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">文件</p>
          <p className="text-sm font-medium text-gray-800 truncate">{task.fileName}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">字数</p>
          <p className="text-sm font-medium text-gray-800">{wordCount.toLocaleString()}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">耗时</p>
          <p className="text-sm font-medium text-gray-800">{task.processingTime ? formatDuration(task.processingTime) : '-'}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">策略{hasSpeakers ? ` · ${speakerList.length} 人` : ''}</p>
          <p className="text-sm font-medium text-gray-800">{getStrategyLabel(result.strategy)}</p>
        </div>
      </div>

      {/* 说话人统计 */}
      {hasSpeakers && result.speakerStats && (
        <div className="flex flex-wrap gap-3 mb-4">
          {speakerList.map((speaker) => {
            const stats = result.speakerStats![speaker]
            const colorIdx = getSpeakerColorIndex(speaker, speakerList)
            return (
              <div key={speaker} className="flex items-center gap-2 text-sm text-gray-600">
                <span className={`w-2.5 h-2.5 rounded-full ${SPEAKER_DOT_COLORS[colorIdx]}`} />
                <span>{speaker}</span>
                {stats && <span className="text-gray-400">({stats.segments}段, {formatDuration(stats.duration)})</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* 关键词 */}
      {hasKeywords && (
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-xs text-gray-400 leading-6">关键词</span>
          {result.keywords!.map((kw) => (
            <button
              key={kw.word}
              onClick={() => setActiveKeyword(activeKeyword === kw.word ? null : kw.word)}
              className={`px-2.5 py-0.5 text-sm rounded-full border transition-colors cursor-pointer ${
                activeKeyword === kw.word
                  ? 'bg-yellow-100 border-yellow-300 text-yellow-800'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {kw.word}
            </button>
          ))}
          {activeKeyword && (
            <button
              onClick={() => setActiveKeyword(null)}
              className="px-2 py-0.5 text-xs text-gray-400 hover:text-gray-600"
            >
              清除高亮
            </button>
          )}
        </div>
      )}

      {/* 转写文本 */}
      <div className="flex-1 bg-white border border-gray-200 rounded-lg p-6 overflow-auto">
        {hasTimestamps && showTimestamps ? (
          <div className="space-y-2">
            {result.segments!.map((seg, i) => {
              const colorIdx = seg.speaker ? getSpeakerColorIndex(seg.speaker, speakerList) : 0
              return (
                <div key={i} className={`flex gap-3 p-2 rounded-lg ${seg.speaker ? SPEAKER_COLORS[colorIdx] : ''} border ${seg.speaker ? '' : 'border-transparent'}`}>
                  <div className="shrink-0 pt-0.5">
                    <span className="text-xs font-mono text-gray-400 whitespace-nowrap">
                      {formatTimestamp(seg.start)} - {formatTimestamp(seg.end)}
                    </span>
                    {seg.speaker && (
                      <p className="text-xs font-medium mt-0.5">{seg.speaker}</p>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed select-text flex-1">
                    <HighlightText text={seg.text} keyword={activeKeyword} />
                  </p>
                </div>
              )
            })}
          </div>
        ) : (
          <pre className="whitespace-pre-wrap text-gray-800 text-sm leading-relaxed font-sans select-text">
            <HighlightText text={result.text} keyword={activeKeyword} />
          </pre>
        )}
      </div>
    </div>
  )
}
