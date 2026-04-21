import { useCallback } from 'react'
import { Modal, Button, Space, Typography, message, Divider } from 'antd'
import { AudioOutlined, PauseCircleOutlined, PlayCircleOutlined, CopyOutlined, DownloadOutlined } from '@ant-design/icons'
import { useRecording } from '../hooks/useRecording'
import { WaveformVisualizer } from './WaveformVisualizer'
import { RealtimeTranscript } from './RealtimeTranscript'
import { useAppStore } from '../stores/appStore'

const { Text, Title } = Typography

interface RecordingModalProps {
  open: boolean
  onClose: () => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function RecordingModal({ open, onClose }: RecordingModalProps) {
  const { state, analyserRef, start, pause, resume, stop, reset } = useRecording()
  const { status, duration, segments, currentText, finalText, finalSegments, filePath, error } = state
  const { refreshTasks } = useAppStore()

  const isStopped = status === 'stopped'
  const isRecording = status === 'recording'
  const isPaused = status === 'paused'
  const isActive = isRecording || isPaused

  const handleClose = useCallback(() => {
    if (isActive) {
      stop().then(() => {
        onClose()
      })
    } else {
      reset()
      onClose()
    }
  }, [isActive, stop, reset, onClose])

  const handleCopy = useCallback(async () => {
    const text = isStopped ? finalText : segments.map(s => s.text).join(' ')
    if (text) {
      await navigator.clipboard.writeText(text)
      message.success('已复制到剪贴板')
    }
  }, [isStopped, finalText, segments])

  const handleExport = useCallback(async () => {
    const text = isStopped ? finalText : segments.map(s => s.text).join(' ')
    if (text) {
      await window.electronAPI.exportTxt({
        text,
        includeTimestamps: false,
        segments: isStopped ? finalSegments.map(s => ({ text: s.text, start: s.startTime, end: s.endTime })) : undefined,
      })
    }
  }, [isStopped, finalText, finalSegments, segments])

  const handleNewRecording = useCallback(() => {
    reset()
    start()
  }, [reset, start])

  // Display text for stopped state
  const displaySegments = isStopped
    ? finalSegments.map(s => ({ text: s.text, startTime: s.startTime }))
    : segments.map(s => ({ text: s.text, startTime: s.startTime }))

  const displayCurrentText = isStopped ? '' : currentText

  return (
    <Modal
      title={null}
      open={open}
      onCancel={handleClose}
      footer={null}
      width={640}
      destroyOnClose
      maskClosable={false}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Space>
            <AudioOutlined style={{ fontSize: 20, color: isRecording ? '#ff4d4f' : undefined }} />
            <Title level={5} style={{ margin: 0 }}>实时录音识别</Title>
          </Space>
          <Space>
            {isRecording && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#ff4d4f', animation: 'blink 1s step-end infinite' }} />
                <Text type="danger">录音中</Text>
                <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
              </span>
            )}
            {isPaused && <Text type="warning">已暂停</Text>}
            {isStopped && <Text type="success">录音完成</Text>}
            {isActive && <Text strong style={{ fontFamily: 'monospace', fontSize: 16 }}>{formatDuration(duration)}</Text>}
          </Space>
        </div>

        {/* Waveform with controls */}
        {!isStopped && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 12, backgroundColor: '#fff', borderRadius: 6, border: '1px solid var(--ant-color-border, #d9d9d9)' }}>
            <WaveformVisualizer
              analyser={analyserRef.current}
              isActive={isRecording}
              height={60}
            />
            <Space>
              {status === 'idle' && (
                <Button type="primary" danger shape="circle" size="large" icon={<AudioOutlined />} onClick={start} />
              )}
              {isRecording && (
                <>
                  <Button shape="circle" size="large" icon={<PauseCircleOutlined />} onClick={pause} />
                  <Button type="primary" danger shape="circle" size="large" icon={<AudioOutlined />} onClick={stop} />
                </>
              )}
              {isPaused && (
                <>
                  <Button type="primary" shape="circle" size="large" icon={<PlayCircleOutlined />} onClick={resume} />
                  <Button danger shape="circle" size="large" icon={<AudioOutlined />} onClick={stop} />
                </>
              )}
            </Space>
          </div>
        )}

        {/* Transcript */}
        <RealtimeTranscript
          segments={displaySegments}
          currentText={displayCurrentText}
          isRecording={isRecording}
        />

        {/* Error */}
        {error && <Text type="danger">{error}</Text>}

        {/* Controls */}
        <Divider style={{ margin: 0 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {/* Left: action buttons */}
          <Space>
            {isStopped && (
              <Button type="primary" icon={<AudioOutlined />} onClick={handleNewRecording}>
                重新录音
              </Button>
            )}
          </Space>

          {/* Right: result actions */}
          <Space>
            {(isStopped || segments.length > 0) && (
              <>
                <Button size="small" icon={<CopyOutlined />} onClick={handleCopy}>复制</Button>
                <Button size="small" icon={<DownloadOutlined />} onClick={handleExport}>导出</Button>
              </>
            )}
          </Space>
        </div>
      </div>
    </Modal>
  )
}
