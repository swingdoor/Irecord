import { useCallback, useState, useEffect } from 'react'
import { Button, Space, Typography, message, Modal, Checkbox, Card } from 'antd'
import { ArrowLeftOutlined, AudioOutlined, PauseCircleOutlined, PlayCircleOutlined, StopOutlined, DownloadOutlined, CopyOutlined } from '@ant-design/icons'
import { useRecording } from '../hooks/useRecording'
import { WaveformVisualizer } from '../components/WaveformVisualizer'
import { RealtimeTranscript } from '../components/RealtimeTranscript'
import { useAppStore } from '../stores/appStore'

const { Title, Text } = Typography

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function generateRecordingTitle(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hour = String(now.getHours()).padStart(2, '0')
  const minute = String(now.getMinutes()).padStart(2, '0')
  const second = String(now.getSeconds()).padStart(2, '0')

  return `语音_${year}${month}${day}${hour}${minute}${second}`
}

function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')

  return `${year}年${String(month).padStart(2, '0')}月${String(day).padStart(2, '0')}日 ${hour}:${minute}`
}

export default function RecordingPage() {
  const { state, analyserRef, start, pause, resume, stop, reset } = useRecording()
  const { status, duration, segments, currentText, currentSegmentStartTime, error } = state
  const { setPage, refreshTasks, refreshRealtimeRecordings } = useAppStore()

  const [recordingTitle] = useState(() => generateRecordingTitle())
  const [recordingDate] = useState(() => new Date())
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)
  const [enableProofreading, setEnableProofreading] = useState(true)

  const isRecording = status === 'recording'
  const isPaused = status === 'paused'
  const isIdle = status === 'idle'
  const isInitializing = status === 'initializing'

  const handleBack = useCallback(() => {
    if (isRecording || isPaused) {
      setConfirmModalOpen(true)
    } else {
      reset()
      setPage('taskList')
    }
  }, [isRecording, isPaused, reset, setPage])

  const handleStop = useCallback(() => {
    setConfirmModalOpen(true)
  }, [])

  const handleDiscard = useCallback(() => {
    reset()
    setConfirmModalOpen(false)
    setPage('taskList')
  }, [reset, setPage])

  const handleContinue = useCallback(() => {
    setConfirmModalOpen(false)
  }, [])

  const handleFinish = useCallback(async () => {
    setConfirmModalOpen(false)

    try {
      // Stop recording and get result
      const result = await stop()

      if (!result || !result.filePath) {
        message.error('录音数据获取失败')
        return
      }

      const saveResult = await window.electronAPI.saveRealtimeRecording({
        title: recordingTitle,
        filePath: result.filePath,
        fileSize: 0, // Will be calculated in backend
        duration: result.duration || duration,
        wordCount: result.text?.length || 0,
        text: result.text || '',
        segments: (result.segments || []).map(s => ({
          text: s.text,
          start: s.startTime,
          end: s.endTime
        })),
        createProofreadingTask: enableProofreading
      })

      if (saveResult.error) {
        message.error(saveResult.error)
        return
      }

      message.success('录音已保存')
      await refreshRealtimeRecordings()

      if (enableProofreading) {
        await refreshTasks()
      }

      setPage('taskList')
    } catch (err: any) {
      message.error(err.message || '保存失败')
    }
  }, [stop, recordingTitle, duration, enableProofreading, refreshRealtimeRecordings, refreshTasks, setPage])

  const displaySegments = segments.map(s => ({ text: s.text, startTime: s.startTime, endTime: s.endTime }))

  const getFullText = useCallback(() => {
    return segments.map(s => s.text).join('\n') + (currentText ? '\n' + currentText : '')
  }, [segments, currentText])

  const handleCopy = useCallback(async () => {
    const text = getFullText()
    if (!text.trim()) { message.warning('暂无识别内容'); return }
    await navigator.clipboard.writeText(text)
    message.success('已复制到剪贴板')
  }, [getFullText])

  const handleExport = useCallback(async () => {
    const text = getFullText()
    if (!text.trim()) { message.warning('暂无识别内容'); return }
    const result = await window.electronAPI.exportRealtimeRecordingTxt({
      text,
      includeTimestamps: true,
      segments: segments.map(s => ({
        text: s.text,
        start: s.startTime,
        end: s.endTime
      }))
    })
    if (result?.filePath) {
      message.success('导出成功')
    }
  }, [getFullText, segments])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      padding: 24,
      gap: 16,
      backgroundColor: '#ffffff',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={handleBack}
        >
          返回
        </Button>
        <div style={{ flex: 1 }}>
          <Title level={5} style={{ margin: 0 }}>{recordingTitle}</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(recordingDate)}</Text>
        </div>
      </div>

      {/* Content Container - Centered with more padding */}
      <div style={{ maxWidth: 900, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24, flex: 1, paddingBottom: 16 }}>
        {/* Audio Control Area */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: 16,
          border: '1px solid var(--ant-color-border, #d9d9d9)',
          borderRadius: 8,
          backgroundColor: 'var(--ant-color-bg-container, #fff)',
        }}>
          {/* Left: Control Buttons */}
          <Space size="small">
            {(isIdle || isInitializing) && (
              <Button
                type="primary"
                danger
                shape="circle"
                size="large"
                icon={<AudioOutlined />}
                onClick={() => start()}
                loading={isInitializing}
                disabled={isInitializing}
                style={{ width: 40, height: 40 }}
              />
            )}
            {isRecording && (
              <>
                <Button
                  type="default"
                  shape="circle"
                  size="large"
                  icon={<PauseCircleOutlined />}
                  onClick={pause}
                  style={{ width: 40, height: 40 }}
                />
                <Button
                  danger
                  shape="circle"
                  size="large"
                  icon={<StopOutlined />}
                  onClick={handleStop}
                  style={{ width: 40, height: 40 }}
                />
              </>
            )}
            {isPaused && (
              <>
                <Button
                  type="primary"
                  shape="circle"
                  size="large"
                  icon={<PlayCircleOutlined />}
                  onClick={resume}
                  style={{ width: 40, height: 40 }}
                />
                <Button
                  danger
                  shape="circle"
                  size="large"
                  icon={<StopOutlined />}
                  onClick={handleStop}
                  style={{ width: 40, height: 40 }}
                />
              </>
            )}
          </Space>

          {/* Center: Waveform */}
          <div style={{ flex: 1 }}>
            <WaveformVisualizer
              analyser={analyserRef.current}
              isActive={isRecording}
              height={60}
            />
          </div>

          {/* Right: Duration + Status + Settings */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 100 }}>
              <Text strong style={{ fontSize: 18 }}>
                {formatDuration(duration)}
              </Text>
              {isRecording && (
                <Space size={4} style={{ marginTop: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#ff4d4f', animation: 'blink 1s step-end infinite' }} />
                  <Text type="danger" style={{ fontSize: 12 }}>录音中</Text>
                  <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
                </Space>
              )}
              {isPaused && (
                <Text type="warning" style={{ fontSize: 12, marginTop: 4 }}>已暂停</Text>
              )}
            </div>
          </div>
        </div>

        {/* Transcript Area */}
        <Card
          size="small"
          title="识别结果"
          extra={
            <Space size="small">
              <Button type="text" icon={<CopyOutlined />} onClick={handleCopy}>复制</Button>
              <Button type="text" icon={<DownloadOutlined />} onClick={handleExport}>导出</Button>
            </Space>
          }
          style={{
            flex: 1,
            minHeight: 360,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            marginBottom: 16,
          }}
          styles={{ body: { flex: 1, overflow: 'auto' } }}
        >
          <RealtimeTranscript
            segments={displaySegments}
            currentText={currentText}
            isRecording={isRecording}
            isPaused={isPaused}
            currentDuration={currentSegmentStartTime}
          />
        </Card>
      </div>

      {/* Error */}
      {error && (
        <Text type="danger" style={{ textAlign: 'center' }}>{error}</Text>
      )}

      {/* Confirmation Modal */}
      <Modal
        title="确定结束录音？"
        open={confirmModalOpen}
        onCancel={handleContinue}
        footer={[
          <Button key="discard" onClick={handleDiscard}>
            不保存
          </Button>,
          <Button key="continue" onClick={handleContinue}>
            继续录音
          </Button>,
          <Button key="finish" type="primary" onClick={handleFinish}>
            结束录音
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 16 }}>
          <Checkbox
            checked={enableProofreading}
            onChange={(e) => setEnableProofreading(e.target.checked)}
          >
            开启精准校对（推荐）
          </Checkbox>
        </div>
        <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
          使用更高精度的模型重新识别，提升转写准确率
        </Text>
      </Modal>
    </div>
  )
}
