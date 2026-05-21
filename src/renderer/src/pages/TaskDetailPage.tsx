import { useState, useCallback, useEffect, useRef } from 'react'
import { Typography, Button, Space, Row, Col, Card, Spin, message } from 'antd'
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
    setCurrentResult(null)
    setCurrentTask(null)
    setActiveTab('upload')
    setPage('taskList')
  }, [setPage, setCurrentResult, setCurrentTask, setActiveTab])

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    )
  }

  const segments = currentResult.segments || []
  const keywords = currentResult.keywords || []
  const speakerStats = currentResult.speakerStats

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 24, gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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
      <Row gutter={16} style={{ flex: 1, overflow: 'hidden' }}>
        {/* Left: Audio + Transcript */}
        <Col span={14} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Card size="small" style={{ marginBottom: 12 }}>
            <AudioPlayer ref={playerRef} filePath={currentTask.filePath} onTimeUpdate={setCurrentTime} />
          </Card>
          <Card size="small" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} styles={{ body: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' } }}>
            <TranscriptPanel
              segments={segments}
              keywords={keywords}
              speakerStats={speakerStats}
              currentTime={currentTime}
              onSeek={handleSeek}
            />
          </Card>
        </Col>

        {/* Right: AI Panel */}
        <Col span={10} style={{ height: '100%' }}>
          <div style={{ height: '100%', border: '1px solid #f0f0f0', borderRadius: 8, padding: 16, background: '#fff', display: 'flex', flexDirection: 'column' }}>
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
        </Col>
      </Row>
    </div>
  )
}
