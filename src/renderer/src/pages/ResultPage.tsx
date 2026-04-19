import { useState, useCallback } from 'react'
import { ArrowLeft, Copy, Download, Check } from 'lucide-react'
import { useAppStore } from '../stores/appStore'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

export default function ResultPage() {
  const { fileInfo, result, processing, reset } = useAppStore()
  const [copied, setCopied] = useState(false)
  const [showTimestamps, setShowTimestamps] = useState(true)

  const hasTimestamps = !!(result?.segments && result.segments.length > 0)

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
    })
    if (res.error) {
      alert(res.error)
    }
  }, [result, hasTimestamps, showTimestamps])

  const handleBack = useCallback(() => {
    reset()
  }, [reset])

  if (!result || !fileInfo) {
    return null
  }

  const wordCount = result.text.replace(/\s/g, '').length
  const elapsedSeconds = Math.floor((Date.now() - processing.startTime) / 1000)

  return (
    <div className="min-h-screen flex flex-col p-6">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 text-gray-600 hover:text-gray-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>返回</span>
        </button>

        <div className="flex items-center gap-2">
          {hasTimestamps && (
            <button
              onClick={() => setShowTimestamps(!showTimestamps)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {showTimestamps ? '隐藏时间戳' : '显示时间戳'}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            {copied ? '已复制' : '复制全部'}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            导出 TXT
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">文件</p>
          <p className="text-sm font-medium text-gray-800 truncate">{fileInfo.fileName}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">字数</p>
          <p className="text-sm font-medium text-gray-800">{wordCount.toLocaleString()}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">耗时</p>
          <p className="text-sm font-medium text-gray-800">{formatDuration(elapsedSeconds)}</p>
        </div>
      </div>

      <div className="flex-1 bg-white border border-gray-200 rounded-lg p-6 overflow-auto">
        {hasTimestamps && showTimestamps ? (
          <div className="space-y-3">
            {result.segments!.map((seg, i) => (
              <div key={i} className="flex gap-3">
                <span className="text-xs text-gray-400 font-mono whitespace-nowrap pt-0.5">
                  {formatTimestamp(seg.start)} - {formatTimestamp(seg.end)}
                </span>
                <p className="text-sm text-gray-800 leading-relaxed select-text flex-1">
                  {seg.text}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <pre className="whitespace-pre-wrap text-gray-800 text-sm leading-relaxed font-sans select-text">
            {result.text}
          </pre>
        )}
      </div>
    </div>
  )
}
