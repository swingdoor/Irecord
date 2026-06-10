import { useState, useCallback, useEffect } from 'react'
import { Typography, Button, Space, Card, Spin, message, Tag } from 'antd'
import { ArrowLeftOutlined, ExperimentOutlined, DownloadOutlined } from '@ant-design/icons'
import { useAppStore } from '../stores/appStore'
import { AudioPlayer } from '../components/AudioPlayer'

const { Title, Text } = Typography

type TranscriptionStatus = 'none' | 'pending' | 'processing' | 'completed' | 'failed' | 'stopped' | 'pending_analysis' | 'recording'

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
    refreshTasks, setActiveTab, setCurrentTaskId,
  } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<TranscriptionStatus>('none')
  const [transcribing, setTranscribing] = useState(false)

  useEffect(() => {
    if (!currentRealtimeRecordingId) { setPage('taskList'); return }
    const load = async () => {
      setLoading(true)
      const result = await window.electronAPI.getRealtimeRecording(currentRealtimeRecordingId)
      if (result.error || !result.recording) { setPage('taskList'); return }

      // 查询转写状态：已完成则直接跳转写详情，复用 TaskDetailPage
      const st = await window.electronAPI.getRecordingTranscriptionStatus(currentRealtimeRecordingId)
      if (st.status === 'completed' && st.taskId) {
        setCurrentTaskId(st.taskId)
        setPage('taskDetail')
        return
      }

      setCurrentRealtimeRecording(result.recording)
      setStatus(st.status)
      setLoading(false)
    }
    load()
  }, [currentRealtimeRecordingId, setPage, setCurrentRealtimeRecording, setCurrentTaskId])

  const handleBack = useCallback(() => {
    setCurrentRealtimeRecording(null)
    setActiveTab('realtime')
    setPage('taskList')
  }, [setPage, setCurrentRealtimeRecording, setActiveTab])

  const handleTranscribe = useCallback(async () => {
    if (!currentRealtimeRecording) return
    setTranscribing(true)
    const result = await window.electronAPI.createRecordingTranscription(currentRealtimeRecording.id)
    setTranscribing(false)
    if (result.error) {
      message.error(result.error)
    } else {
      message.success('语音转写任务已创建')
      await refreshTasks()
      setStatus('pending')
      // 返回列表查看进度
      setActiveTab('realtime')
      setPage('taskList')
    }
  }, [currentRealtimeRecording, refreshTasks, setActiveTab, setPage])

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

  const isTranscribing = status === 'pending' || status === 'processing' || status === 'pending_analysis'

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
          {!isTranscribing && (
            <Button type="primary" icon={<ExperimentOutlined />} loading={transcribing} onClick={handleTranscribe}>
              语音转写
            </Button>
          )}
        </Space>
      </div>

      {/* 内容区（可滚动）*/}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 音频播放 */}
        <Card size="small">
          <AudioPlayer filePath={currentRealtimeRecording.filePath} />
        </Card>

        {/* 转写状态提示 */}
        <Card size="small">
          {isTranscribing ? (
            <Space>
              <Spin size="small" />
              <Text>语音转写进行中，可在实时录音列表查看进度</Text>
            </Space>
          ) : status === 'failed' ? (
            <Space direction="vertical">
              <Tag color="red">转写失败</Tag>
              <Text type="secondary">可点击右上角「语音转写」重新转写</Text>
            </Space>
          ) : (
            <Space direction="vertical">
              <Text type="secondary">此录音尚未转写。</Text>
              <Text type="secondary">点击右上角「语音转写」调用本地离线转写，完成后可查看转写文本与 AI 分析。</Text>
            </Space>
          )}
        </Card>
      </div>
    </div>
  )
}
