import { useState, useCallback, useEffect, useRef } from 'react'
import { Typography, Button, Space, Card, Spin, message } from 'antd'
import { ArrowLeftOutlined, CopyOutlined, DownloadOutlined } from '@ant-design/icons'
import { useAppStore, TaskResultData } from '../stores/appStore'
import { AudioPlayer, AudioPlayerHandle } from '../components/AudioPlayer'
import { TranscriptPanel } from '../components/TranscriptPanel'
import { AiPanel } from '../components/AiPanel'

const { Title, Text } = Typography

function formatDetailDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function getModelLabel(modelType?: string): string {
  switch (modelType) {
    case 'qwen3-asr': return 'Qwen3-ASR'
    case 'sensevoice-small': return 'SenseVoice'
    default: return modelType || '-'
  }
}

export default function TaskDetailPage() {
  const { currentTaskId, setPage, currentResult, setCurrentResult, currentTask, setCurrentTask, setActiveTab } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const playerRef = useRef<AudioPlayerHandle>(null)

  useEffect(() => {
    if (!currentTaskId) { setPage('taskList'); return }
    const load = async () => {
      setLoading(true)
      const data = await window.electronAPI.getTaskResult(currentTaskId)
      if (data.error) { setPage('taskList'); return }
      setCurrentTask(data.task)
      setCurrentResult(data.result)
      setLoading(false)
    }
    load()
  }, [currentTaskId])

  const handleBack = useCallback(() => {
    // 录音来源的转写任务返回实时录音 Tab，文件上传返回上传 Tab
    const backTab = currentTask?.source === 'recording' ? 'realtime' : 'upload'
    setCurrentResult(null)
    setCurrentTask(null)
    setActiveTab(backTab)
    setPage('taskList')
  }, [setPage, setCurrentResult, setCurrentTask, setActiveTab, currentTask])

  const handleCopy = useCallback(async () => {
    if (!currentResult) return
    await navigator.clipboard.writeText(currentResult.text)
    message.success('已复制到剪贴板')
  }, [currentResult])

  const handleExport = useCallback(async () => {
    if (!currentResult) return
    const hasSegments = !!(currentResult.segments && currentResult.segments.length > 0)
    await window.electronAPI.exportTxt({
      text: currentResult.text,
      includeTimestamps: hasSegments,
      segments: currentResult.segments,
      keywords: currentResult.keywords,
      fileName: currentTask?.fileName,
      label: '转写',
    })
  }, [currentResult, currentTask])

  const handleSeek = useCallback((time: number) => {
    playerRef.current?.seekTo(time)
  }, [])

  if (loading || !currentResult || !currentTask) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Spin size="large" />
      </div>
    )
  }

  const segments = currentResult.segments || []
  const keywords = currentResult.keywords || []
  const speakerStats = currentResult.speakerStats

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 30px)', padding: 24, gap: 16, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <Space>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={handleBack} />
          <div>
            <Title level={5} style={{ margin: 0 }}>{currentTask.fileName}</Title>
            <Space size={16} style={{ fontSize: 12 }}>
              <Text type="secondary">{formatDetailDate(currentTask.createdAt)}</Text>
              <Text type="secondary">字数: {currentTask.wordCount?.toLocaleString() || '-'}</Text>
              <Text type="secondary">模型: {getModelLabel(currentTask.modelType)}</Text>
              <Text type="secondary">耗时: {currentTask.processingTime != null ? formatDuration(currentTask.processingTime) : '-'}</Text>
            </Space>
          </div>
        </Space>
        <Space>
          <Button icon={<CopyOutlined />} onClick={handleCopy}>复制</Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>导出</Button>
        </Space>
      </div>

      {/* Body: left-right layout */}
      <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0, overflow: 'hidden' }}>
        {/* Left: Audio + Transcript (58%) */}
        <div style={{ flex: '0 0 58%', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <Card size="small" style={{ marginBottom: 12, flexShrink: 0 }}>
            <AudioPlayer ref={playerRef} filePath={currentTask.filePath} onTimeUpdate={setCurrentTime} />
          </Card>
          <Card size="small" style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} styles={{ body: { flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' } }}>
            <TranscriptPanel
              segments={segments}
              keywords={keywords}
              speakerStats={speakerStats}
              currentTime={currentTime}
              onSeek={handleSeek}
            />
          </Card>
        </div>

        {/* Right: AI Panel (42%) */}
        <div style={{ flex: '0 0 calc(42% - 8px)', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0, border: '1px solid #f0f0f0', borderRadius: 8, padding: 16, background: '#fff', display: 'flex', flexDirection: 'column' }}>
            <AiPanel
              text={currentResult.text}
              segments={segments}
              speakerStats={speakerStats}
              aiSummary={currentResult.aiSummary}
              aiSpeakers={currentResult.aiSpeakers}
              aiMinutes={currentResult.aiMinutes}
              aiQa={currentResult.aiQa}
              taskId={currentTask.id}
              fileName={currentTask.fileName}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
