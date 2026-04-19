import { useState, useCallback } from 'react'
import { Upload, FileAudio, FileVideo, AlertCircle } from 'lucide-react'
import { useAppStore } from '../stores/appStore'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function UploadPage() {
  const { fileInfo, setFileInfo, setPage, setProcessing, setError, error } = useAppStore()
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleFile = useCallback(async (filePath: string) => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.validateFile(filePath)
      if ('error' in result && result.error) {
        setError(result.error)
        setFileInfo(null)
      } else {
        setFileInfo(result as any)
      }
    } catch (err: any) {
      setError(err.message || '文件验证失败')
    } finally {
      setLoading(false)
    }
  }, [setFileInfo, setError])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) {
      handleFile(file.path)
    }
  }, [handleFile])

  const handleSelectFile = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.selectFile()
      if (result && !('error' in result)) {
        setFileInfo(result as any)
      } else if (result && 'error' in result) {
        setError(result.error || '文件选择失败')
      }
    } catch (err: any) {
      setError(err.message || '文件选择失败')
    } finally {
      setLoading(false)
    }
  }, [setFileInfo, setError])

  const handleStartProcessing = useCallback(async () => {
    if (!fileInfo) return
    setError(null)
    setProcessing({ startTime: Date.now(), percent: 0, stage: 'preprocessing' })
    setPage('processing')
  }, [fileInfo, setPage, setProcessing, setError])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <h1 className="text-2xl font-semibold text-gray-800 mb-8">语音转写助手</h1>

      {/* 拖放区域 */}
      <div
        className={`w-full max-w-xl border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400 bg-white'
        }`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={handleSelectFile}
      >
        <Upload className="w-10 h-10 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600 mb-2">
          {loading ? '正在读取文件...' : '拖放文件到此处或点击选择'}
        </p>
        <p className="text-sm text-gray-400">
          支持 MP3, WAV, FLAC, AAC, M4A, OGG, MP4, AVI, MKV, MOV, FLV
        </p>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="w-full max-w-xl mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* 文件信息卡片 */}
      {fileInfo && (
        <div className="w-full max-w-xl mt-6 p-4 bg-white border border-gray-200 rounded-lg">
          <div className="flex items-center gap-3 mb-3">
            {fileInfo.isVideo ? (
              <FileVideo className="w-8 h-8 text-purple-500" />
            ) : (
              <FileAudio className="w-8 h-8 text-blue-500" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800 truncate">{fileInfo.fileName}</p>
              <p className="text-sm text-gray-500">
                {formatFileSize(fileInfo.fileSize)} · {fileInfo.isVideo ? '视频' : '音频'} · {formatDuration(fileInfo.duration)}
              </p>
            </div>
          </div>

          <button
            onClick={handleStartProcessing}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            开始识别
          </button>
        </div>
      )}
    </div>
  )
}
