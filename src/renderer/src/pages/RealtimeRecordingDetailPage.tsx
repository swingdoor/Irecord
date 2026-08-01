import { useState, useCallback, useEffect } from 'react'
import { Typography, Button, Space, Card, Spin, message } from 'antd'
import { ArrowLeftOutlined, FileTextOutlined, DownloadOutlined } from '@ant-design/icons'
import { useAppStore } from '../stores/appStore'
import { AudioPlayer } from '../components/AudioPlayer'

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
  const {
    currentRealtimeRecordingId, setPage, currentRealtimeRecording, setCurrentRealtimeRecording,
    refreshTasks, setActiveTab,
  } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [transcribing, setTranscribing] = useState(false)

  useEffect(() => {
    if (!currentRealtimeRecordingId) { setPage('taskList'); return }
    const load = async () => {
      setLoading(true)
      const result = await window.electronAPI.getRealtimeRecording(currentRealtimeRecordingId)
      if (result.error || !result.recording) { setPage('taskList'); return }

      setCurrentRealtimeRecording(result.recording)
      setLoading(false)
    }
    load()
  }, [currentRealtimeRecordingId, setPage, setCurrentRealtimeRecording])

  const handleBack = useCallback(() => {
    setCurrentRealtimeRecording(null)
    setActiveTab('realtime')
    setPage('taskList')
  }, [setPage, setCurrentRealtimeRecording, setActiveTab])

  const handleTranscribe = useCallback(async () => {
    if (!currentRealtimeRecording) return
    setTranscribing(true)
    const result = await window.electronAPI.addDroppedFiles([currentRealtimeRecording.filePath])
    setTranscribing(false)
    if (result.errors?.length) {
      message.error(result.errors.join('；'))
    } else {
      message.success('已进入文件转写队列')
      await refreshTasks()
      setActiveTab('upload')
      setCurrentRealtimeRecording(null)
      setPage('taskList')
    }
  }, [currentRealtimeRecording, refreshTasks, setActiveTab, setCurrentRealtimeRecording, setPage])

  const handleExportWav = useCallback(async () => {
    if (!currentRealtimeRecording) return
    const result = await window.electronAPI.exportRealtimeRecordingWav(currentRealtimeRecording.filePath)
    if (result.error) message.error(result.error)
    else if (!result.canceled) message.success('导出成功')
  }, [currentRealtimeRecording])

  if (loading || !currentRealtimeRecording) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <Spin size="large" />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 30px)', padding: 24, gap: 16, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <Space>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={handleBack} />
          <div>
            <Title level={5} style={{ margin: 0 }}>{currentRealtimeRecording.title}</Title>
            <Space size={16} style={{ fontSize: 12 }}>
              <Text type="secondary">{formatDetailDate(currentRealtimeRecording.createdAt)}</Text>
              <Text type="secondary">时长: {formatDuration(currentRealtimeRecording.duration)}</Text>
            </Space>
          </div>
        </Space>
        <Space>
          <Button icon={<DownloadOutlined />} onClick={handleExportWav}>下载 WAV</Button>
          <Button type="primary" icon={<FileTextOutlined />} loading={transcribing} onClick={handleTranscribe}>
            文件转写分析
          </Button>
        </Space>
      </div>

      {/* 内容区（可滚动）*/}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 音频播放 */}
        <Card size="small">
          <AudioPlayer filePath={currentRealtimeRecording.filePath} />
        </Card>

        <Card size="small">
          <Text type="secondary">需要转写时，点击右上角「文件转写分析」，任务会进入文件转写列表。</Text>
        </Card>
      </div>
    </div>
  )
}
