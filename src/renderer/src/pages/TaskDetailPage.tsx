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

export default function TaskDetailPage() {
  const { currentTaskId, setPage, currentResult, setCurrentResult, currentTask, setCurrentTask } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [audioUrl, setAudioUrl] = useState('')
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
      // Load audio URL
      if (data.task?.filePath) {
        const res = await window.electronAPI.getFileUrl(data.task.filePath)
        if (res.url) setAudioUrl(res.url)
      }
      setLoading(false)
    }
    load()
  }, [currentTaskId])

  const handleBack = useCallback(() => {
    setCurrentResult(null)
    setCurrentTask(null)
    setPage('taskList')
  }, [setPage, setCurrentResult, setCurrentTask])

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
    })
  }, [currentResult])

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
            <Text type="secondary" style={{ fontSize: 12 }}>{formatDetailDate(currentTask.createdAt)}</Text>
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
            <AudioPlayer ref={playerRef} url={audioUrl} filePath={currentTask.filePath} onTimeUpdate={setCurrentTime} />
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
            />
          </div>
        </Col>
      </Row>
    </div>
  )
}
