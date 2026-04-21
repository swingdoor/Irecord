import { useState, useCallback, useEffect, useRef } from 'react'
import { Typography, Button, Space, Row, Col, Card, Spin, message } from 'antd'
import { ArrowLeftOutlined, CopyOutlined, DownloadOutlined, ExperimentOutlined } from '@ant-design/icons'
import { useAppStore } from '../stores/appStore'
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

export default function RealtimeRecordingDetailPage() {
  const { currentRealtimeRecordingId, setPage, currentRealtimeRecording, setCurrentRealtimeRecording, refreshTasks, setActiveTab } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [audioUrl, setAudioUrl] = useState('')
  const [currentTime, setCurrentTime] = useState(0)
  const playerRef = useRef<AudioPlayerHandle>(null)

  useEffect(() => {
    if (!currentRealtimeRecordingId) { setPage('taskList'); return }
    const load = async () => {
      setLoading(true)
      const result = await window.electronAPI.getRealtimeRecording(currentRealtimeRecordingId)
      if (result.error || !result.recording) { setPage('taskList'); return }
      setCurrentRealtimeRecording(result.recording)

      // Load audio URL
      if (result.recording.filePath) {
        const res = await window.electronAPI.getFileUrl(result.recording.filePath)
        if (res.url) setAudioUrl(res.url)
      }
      setLoading(false)
    }
    load()
  }, [currentRealtimeRecordingId, setPage, setCurrentRealtimeRecording])

  const handleBack = useCallback(() => {
    setCurrentRealtimeRecording(null)
    setPage('taskList')
  }, [setPage, setCurrentRealtimeRecording])

  const handleCopy = useCallback(async () => {
    if (!currentRealtimeRecording) return
    await navigator.clipboard.writeText(currentRealtimeRecording.text)
    message.success('已复制到剪贴板')
  }, [currentRealtimeRecording])

  const handleExport = useCallback(async () => {
    if (!currentRealtimeRecording) return
    const segments = JSON.parse(currentRealtimeRecording.segments)
    await window.electronAPI.exportRealtimeRecordingTxt({
      text: currentRealtimeRecording.text,
      includeTimestamps: true,
      segments
    })
  }, [currentRealtimeRecording])

  const handleProofread = useCallback(async () => {
    if (!currentRealtimeRecording) return
    const result = await window.electronAPI.createProofreadingTask(currentRealtimeRecording.id)
    if (result.error) {
      message.error(result.error)
    } else {
      message.success('精准校对任务已创建')
      await refreshTasks()
      // Switch to upload tab
      if (setActiveTab) setActiveTab('upload')
      setPage('taskList')
    }
  }, [currentRealtimeRecording, refreshTasks, setActiveTab, setPage])

  const handleSeek = useCallback((time: number) => {
    playerRef.current?.seekTo(time)
  }, [])

  if (loading || !currentRealtimeRecording) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <Spin size="large" />
      </div>
    )
  }

  const segments = JSON.parse(currentRealtimeRecording.segments)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 24, gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={handleBack} />
          <div>
            <Title level={5} style={{ margin: 0 }}>{currentRealtimeRecording.title}</Title>
            <Space size={16} style={{ fontSize: 12 }}>
              <Text type="secondary">{formatDetailDate(currentRealtimeRecording.createdAt)}</Text>
              <Text type="secondary">字数: {currentRealtimeRecording.wordCount?.toLocaleString() || '-'}</Text>
              <Text type="secondary">时长: {formatDuration(currentRealtimeRecording.duration)}</Text>
            </Space>
          </div>
        </Space>
        <Space>
          <Button icon={<CopyOutlined />} onClick={handleCopy}>复制</Button>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>导出</Button>
          <Button icon={<ExperimentOutlined />} onClick={handleProofread}>精准校对</Button>
        </Space>
      </div>

      {/* Body: left-right layout */}
      <Row gutter={16} style={{ flex: 1, overflow: 'hidden' }}>
        {/* Left: Audio + Transcript */}
        <Col span={14} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Card size="small" style={{ marginBottom: 12 }}>
            <AudioPlayer ref={playerRef} url={audioUrl} filePath={currentRealtimeRecording.filePath} onTimeUpdate={setCurrentTime} />
          </Card>
          <Card size="small" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} styles={{ body: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' } }}>
            <TranscriptPanel
              segments={segments}
              keywords={[]}
              speakerStats={null}
              currentTime={currentTime}
              onSeek={handleSeek}
            />
          </Card>
        </Col>

        {/* Right: AI Panel */}
        <Col span={10} style={{ height: '100%' }}>
          <div style={{ height: '100%', border: '1px solid #f0f0f0', borderRadius: 8, padding: 16, background: '#fff', display: 'flex', flexDirection: 'column' }}>
            <AiPanel
              text={currentRealtimeRecording.text}
              segments={segments}
              speakerStats={null}
              aiSummary={null}
              aiSpeakers={null}
              aiMinutes={null}
              aiQa={null}
              taskId={currentRealtimeRecording.id}
            />
          </div>
        </Col>
      </Row>
    </div>
  )
}
