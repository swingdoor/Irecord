import { useEffect, useCallback, useState, useRef } from 'react'
import { Loader2, X } from 'lucide-react'
import { useAppStore } from '../stores/appStore'

const STAGE_LABELS: Record<string, string> = {
  preprocessing: '音频预处理',
  initializing: '加载模型',
  segmenting: '音频分段',
  recognizing: '语音识别中',
  done: '处理完成',
}

export default function ProcessingPage() {
  const { fileInfo, processing, setProcessing, setPage, setResult, setError, reset } = useAppStore()
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const started = useRef(false)

  // 启动处理
  useEffect(() => {
    if (!fileInfo || started.current) return
    started.current = true

    let unsubscribe: (() => void) | undefined

    const startProcessing = async () => {
      try {
        unsubscribe = window.electronAPI.onProcessingProgress((progress) => {
          setProcessing({
            stage: progress.stage,
            percent: progress.percent,
          })
        })

        const result = await window.electronAPI.startProcessing(fileInfo.filePath)

        if ('error' in result && result.error) {
          setError(result.error)
          setPage('upload')
        } else {
          setResult(result as any)
          setPage('result')
        }
      } catch (err: any) {
        setError(err.message || '处理失败')
        setPage('upload')
      }
    }

    startProcessing()

    return () => {
      unsubscribe?.()
    }
  }, [fileInfo])

  // 计时器
  useEffect(() => {
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - processing.startTime) / 1000)
      setElapsedSeconds(elapsed)
    }, 1000)

    return () => clearInterval(timer)
  }, [processing.startTime])

  const handleCancel = useCallback(async () => {
    await window.electronAPI.cancelProcessing()
    reset()
  }, [reset])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-md">
        {/* 加载动画 */}
        <div className="flex justify-center mb-6">
          <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        </div>

        {/* 状态文本 */}
        <h2 className="text-xl font-semibold text-gray-800 text-center mb-2">
          {STAGE_LABELS[processing.stage] || '处理中'}
        </h2>
        <p className="text-sm text-gray-500 text-center mb-8">
          已用时 {formatTime(elapsedSeconds)}
        </p>

        {/* 文件信息 */}
        {fileInfo && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600 mb-1">正在处理</p>
            <p className="font-medium text-gray-800 truncate">{fileInfo.fileName}</p>
          </div>
        )}

        {/* 取消按钮 */}
        <button
          onClick={handleCancel}
          className="w-full py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium flex items-center justify-center gap-2"
        >
          <X className="w-4 h-4" />
          取消
        </button>
      </div>
    </div>
  )
}
