import { useCallback, useState, useRef } from 'react'
import { Button, Space, Typography, message, Modal, Checkbox, Card } from 'antd'
import { ArrowLeftOutlined, AudioOutlined, PauseCircleOutlined, PlayCircleOutlined, StopOutlined, CheckCircleFilled } from '@ant-design/icons'
import { useRecording } from '../hooks/useRecording'
import { WaveformVisualizer } from '../components/WaveformVisualizer'
import { AudioPlayer } from '../components/AudioPlayer'
import { useAppStore } from '../stores/appStore'

const { Title, Text } = Typography

// 录音页阶段（后处理移除后简化为：录音中 / 停止后配置）
type Stage = 'recording' | 'stopped'

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
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
  const { status, duration, error } = state
  const { setPage, refreshTasks, refreshRealtimeRecordings, setActiveTab } = useAppStore()

  const [recordingTitle] = useState(() => generateRecordingTitle())
  const [recordingDate] = useState(() => new Date())
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)
  const [enableTranscription, setEnableTranscription] = useState(true)

  // 阶段工作流状态
  const [stage, setStage] = useState<Stage>('recording')
  const [originalFile, setOriginalFile] = useState<{ path: string; size: number; duration: number } | null>(null)
  const savingRef = useRef(false)

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

  const handleStop = useCallback(async () => {
    const result = await stop()
    if (!result || !result.filePath) {
      message.error('录音数据获取失败')
      return
    }
    setOriginalFile({
      path: result.filePath,
      size: result.fileSize || 0,
      duration: result.duration || duration,
    })
    setStage('stopped')
  }, [stop, duration])

  const handleDiscard = useCallback(() => {
    reset()
    setPage('taskList')
  }, [reset, setPage])

  // 阶段②点击"保存录音"：保存纯音频记录，可选创建语音转写，完成后 toast + 自动退出
  const handleSave = useCallback(async () => {
    if (!originalFile) return
    if (savingRef.current) return
    savingRef.current = true

    try {
      const saveResult = await window.electronAPI.saveRealtimeRecording({
        title: recordingTitle,
        filePath: originalFile.path,
        fileSize: originalFile.size,
        duration: originalFile.duration,
        createTranscription: enableTranscription,
      })

      if (saveResult.error) {
        message.error(saveResult.error)
        savingRef.current = false
        return
      }

      // 成功后提示并自动返回列表
      await refreshRealtimeRecordings()
      if (enableTranscription) {
        await refreshTasks()
        message.success('录音已保存，语音转写任务已创建', 2)
      } else {
        message.success('录音已保存', 2)
      }

      // 延迟 0.5s 自动退出（让用户看到 toast）
      setTimeout(() => {
        setActiveTab('realtime')
        reset()
        setPage('taskList')
      }, 500)
    } catch (err: any) {
      message.error(err.message || '保存失败')
      savingRef.current = false
    }
  }, [originalFile, recordingTitle, enableTranscription, refreshRealtimeRecordings, refreshTasks, setActiveTab, reset, setPage])

  const goToRecordingList = useCallback(() => {
    setActiveTab('realtime')
    reset()
    setPage('taskList')
  }, [setActiveTab, reset, setPage])

  return (
    <div style={{
      height: 'calc(100vh - 30px)',
      display: 'flex',
      flexDirection: 'column',
      padding: 24,
      gap: 16,
      backgroundColor: '#ffffff',
      overflow: 'hidden',
    }}>
      {/* Header（固定）*/}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={handleBack}>返回</Button>
        <div style={{ flex: 1 }}>
          <Title level={5} style={{ margin: 0 }}>{recordingTitle}</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(recordingDate)}</Text>
        </div>
      </div>

      {/* 内容区（居中 + 兜底滚动）*/}
      <div style={{ maxWidth: 760, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20, flex: 1, minHeight: 0, overflow: 'auto' }}>

        {/* ===== 阶段① 录音中 ===== */}
        {stage === 'recording' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16, padding: 16,
            border: '1px solid var(--ant-color-border, #d9d9d9)', borderRadius: 8,
          }}>
            <Space size="small">
              {(isIdle || isInitializing) && (
                <Button type="primary" danger shape="circle" size="large" icon={<AudioOutlined />}
                  onClick={() => start()} loading={isInitializing} disabled={isInitializing}
                  style={{ width: 40, height: 40 }} />
              )}
              {isRecording && (
                <>
                  <Button shape="circle" size="large" icon={<PauseCircleOutlined />} onClick={pause} style={{ width: 40, height: 40 }} />
                  <Button danger shape="circle" size="large" icon={<StopOutlined />} onClick={handleStop} style={{ width: 40, height: 40 }} />
                </>
              )}
              {isPaused && (
                <>
                  <Button type="primary" shape="circle" size="large" icon={<PlayCircleOutlined />} onClick={resume} style={{ width: 40, height: 40 }} />
                  <Button danger shape="circle" size="large" icon={<StopOutlined />} onClick={handleStop} style={{ width: 40, height: 40 }} />
                </>
              )}
            </Space>

            <div style={{ flex: 1 }}>
              <WaveformVisualizer analyser={analyserRef.current} isActive={isRecording} height={60} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 100 }}>
              <Text strong style={{ fontSize: 18 }}>{formatDuration(duration)}</Text>
              {isRecording && (
                <Space size={4} style={{ marginTop: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#ff4d4f', animation: 'blink 1s step-end infinite' }} />
                  <Text type="danger" style={{ fontSize: 12 }}>录音中</Text>
                  <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
                </Space>
              )}
              {isPaused && <Text type="warning" style={{ fontSize: 12, marginTop: 4 }}>已暂停</Text>}
            </div>
          </div>
        )}

        {/* ===== 阶段② 停止后（仅转写开关）===== */}
        {stage === 'stopped' && originalFile && (
          <>
            <Card size="small" title={<Space><CheckCircleFilled style={{ color: '#52c41a' }} />录音完成 · {formatDuration(originalFile.duration)} · {formatSize(originalFile.size)}</Space>}>
              <AudioPlayer filePath={originalFile.path} />
            </Card>

            <Card size="small">
              <Checkbox checked={enableTranscription} onChange={(e) => setEnableTranscription(e.target.checked)}>
                创建语音转写（调用本地离线转写，可在实时录音列表查看进度）
              </Checkbox>
            </Card>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Button danger onClick={handleDiscard}>放弃</Button>
              <Button type="primary" onClick={handleSave}>保存录音</Button>
            </div>
          </>
        )}

        {error && <Text type="danger" style={{ textAlign: 'center' }}>{error}</Text>}
      </div>

      {/* 录音中返回的确认 Modal */}
      <Modal
        title="确定结束录音？"
        open={confirmModalOpen}
        onCancel={() => setConfirmModalOpen(false)}
        footer={[
          <Button key="discard" danger onClick={handleDiscard}>不保存</Button>,
          <Button key="continue" onClick={() => setConfirmModalOpen(false)}>继续录音</Button>,
          <Button key="finish" type="primary" onClick={async () => { setConfirmModalOpen(false); await handleStop() }}>停止录音</Button>,
        ]}
      >
        <Text type="secondary" style={{ fontSize: 13 }}>
          停止后可选择是否创建语音转写并保存录音。
        </Text>
      </Modal>
    </div>
  )
}
