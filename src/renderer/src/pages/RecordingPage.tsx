import { useCallback, useState, useEffect, useRef } from 'react'
import { Button, Space, Typography, message, Modal, Checkbox, Card, Progress, Tag } from 'antd'
import { ArrowLeftOutlined, AudioOutlined, PauseCircleOutlined, PlayCircleOutlined, StopOutlined, CheckCircleFilled } from '@ant-design/icons'
import { useRecording } from '../hooks/useRecording'
import { WaveformVisualizer } from '../components/WaveformVisualizer'
import { AudioPlayer } from '../components/AudioPlayer'
import { useAppStore } from '../stores/appStore'

const { Title, Text } = Typography

interface PostProcessingSettings {
  denoise: boolean
  trimSilence: boolean
  normalizeLoudness: boolean
  compress: boolean
  compressFormat: 'm4a' | 'mp3'
  keepOriginal: boolean
}

const DEFAULT_PP: PostProcessingSettings = {
  denoise: false,
  trimSilence: false,
  normalizeLoudness: false,
  compress: false,
  compressFormat: 'm4a',
  keepOriginal: true,
}

// 录音页阶段
type Stage = 'recording' | 'stopped' | 'processing' | 'done'

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
  const { setPage, refreshTasks, refreshRealtimeRecordings } = useAppStore()

  const [recordingTitle] = useState(() => generateRecordingTitle())
  const [recordingDate] = useState(() => new Date())
  const [confirmModalOpen, setConfirmModalOpen] = useState(false)
  const [enableProofreading, setEnableProofreading] = useState(true)

  // 四阶段工作流状态
  const [stage, setStage] = useState<Stage>('recording')
  const [ppSettings, setPpSettings] = useState<PostProcessingSettings>(DEFAULT_PP)
  const [originalFile, setOriginalFile] = useState<{ path: string; size: number; duration: number } | null>(null)
  const [productFile, setProductFile] = useState<{ path: string; size: number; originalPath?: string } | null>(null)
  const [ppProgress, setPpProgress] = useState(0)
  const [ppFailed, setPpFailed] = useState(false)
  const [saved, setSaved] = useState(false)
  const [createdTaskId, setCreatedTaskId] = useState<string | undefined>(undefined)
  const savingRef = useRef(false)

  const isRecording = status === 'recording'
  const isPaused = status === 'paused'
  const isIdle = status === 'idle'
  const isInitializing = status === 'initializing'

  // 加载后处理默认设置
  useEffect(() => {
    window.electronAPI.getSettings().then(settings => {
      const pp = settings.recordingPostProcessing
      if (pp) {
        setPpSettings({
          denoise: pp.denoise ?? false,
          trimSilence: pp.trimSilence ?? false,
          normalizeLoudness: pp.normalizeLoudness ?? false,
          compress: pp.compress ?? false,
          compressFormat: pp.compressFormat ?? 'm4a',
          keepOriginal: pp.keepOriginal ?? true,
        })
      }
    })
  }, [])

  const hasAnyPostProcessing = ppSettings.denoise || ppSettings.trimSilence ||
    ppSettings.normalizeLoudness || ppSettings.compress

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

  // 保存录音记录（成品路径、原始路径、后处理信息）
  const saveRecording = useCallback(async (
    finalPath: string,
    originalPath: string | undefined,
    ppInfo: PostProcessingSettings | null
  ) => {
    if (savingRef.current) return
    savingRef.current = true
    try {
      const saveResult = await window.electronAPI.saveRealtimeRecording({
        title: recordingTitle,
        filePath: finalPath,
        fileSize: 0,
        duration: originalFile?.duration || duration,
        wordCount: 0,
        text: '',
        segments: [],
        createProofreadingTask: enableProofreading,
        originalFilePath: originalPath,
        postProcessing: ppInfo ? {
          denoise: ppInfo.denoise,
          trimSilence: ppInfo.trimSilence,
          normalizeLoudness: ppInfo.normalizeLoudness,
          compress: ppInfo.compress,
          compressFormat: ppInfo.compressFormat,
        } : undefined,
      })
      if (saveResult.error) {
        message.error(saveResult.error)
        return
      }
      setSaved(true)
      setCreatedTaskId(saveResult.taskId)
      await refreshRealtimeRecordings()
      if (enableProofreading) await refreshTasks()
    } catch (err: any) {
      message.error(err.message || '保存失败')
    } finally {
      savingRef.current = false
    }
  }, [recordingTitle, originalFile, duration, enableProofreading, refreshRealtimeRecordings, refreshTasks])

  // 订阅后处理进度事件
  useEffect(() => {
    const unsubProgress = window.electronAPI.onPostprocessingProgress(({ progress }) => {
      setPpProgress(progress)
    })
    const unsubComplete = window.electronAPI.onPostprocessingComplete(({ filePath, fileSize, originalPath }) => {
      setProductFile({ path: filePath, size: fileSize, originalPath })
      setStage('done')
      // 成品作为主 filePath，原始作为 originalFilePath
      saveRecording(filePath, originalPath, ppSettings)
    })
    const unsubError = window.electronAPI.onPostprocessingError(({ error: errMsg }) => {
      message.error(`后处理失败: ${errMsg}，已保留原始录音`)
      setPpFailed(true)
      setStage('done')
      // 降级：用原始 WAV 保存
      if (originalFile) {
        saveRecording(originalFile.path, undefined, null)
      }
    })
    return () => {
      unsubProgress()
      unsubComplete()
      unsubError()
    }
  }, [ppSettings, originalFile, saveRecording])

  // 阶段②点击"保存录音"
  const handleSave = useCallback(async () => {
    if (!originalFile) return

    if (hasAnyPostProcessing) {
      // 走后处理：进入处理中阶段
      setStage('processing')
      setPpProgress(0)
      await window.electronAPI.processRecording(originalFile.path, {
        denoise: ppSettings.denoise,
        trimSilence: ppSettings.trimSilence,
        normalizeLoudness: ppSettings.normalizeLoudness,
        compress: ppSettings.compress,
        compressFormat: ppSettings.compressFormat,
        keepOriginal: ppSettings.keepOriginal,
      })
      // 完成/失败由事件回调驱动 stage 切换
    } else {
      // 无后处理：直接完成，成品即原始
      setProductFile({ path: originalFile.path, size: originalFile.size })
      setStage('done')
      saveRecording(originalFile.path, undefined, null)
    }
  }, [originalFile, hasAnyPostProcessing, ppSettings, saveRecording])

  const togglePp = (key: keyof PostProcessingSettings) => {
    setPpSettings(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // 处理中步骤文案
  const processingSteps = [
    ppSettings.denoise && '降噪',
    ppSettings.trimSilence && '裁剪静音',
    ppSettings.normalizeLoudness && '响度归一',
    ppSettings.compress && '压缩',
  ].filter(Boolean).join(' → ')

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
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={handleBack}>返回</Button>
        <div style={{ flex: 1 }}>
          <Title level={5} style={{ margin: 0 }}>{recordingTitle}</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>{formatDate(recordingDate)}</Text>
        </div>
      </div>

      <div style={{ maxWidth: 760, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>

        {/* ===== 阶段① 录音中 ===== */}
        {(stage === 'recording') && (
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

        {/* ===== 阶段② 停止后配置 ===== */}
        {stage === 'stopped' && originalFile && (
          <>
            <Card size="small" title={<Space><CheckCircleFilled style={{ color: '#52c41a' }} />录音完成 · {formatDuration(originalFile.duration)} · {formatSize(originalFile.size)}</Space>}>
              <AudioPlayer filePath={originalFile.path} />
            </Card>

            <Card size="small" title="后处理选项">
              <Space direction="vertical" size="small" style={{ width: '100%' }}>
                <Space size="large" wrap>
                  <Checkbox checked={ppSettings.compress} onChange={() => togglePp('compress')}>压缩存储 ({ppSettings.compressFormat.toUpperCase()})</Checkbox>
                  <Checkbox checked={ppSettings.denoise} onChange={() => togglePp('denoise')}>降噪</Checkbox>
                  <Checkbox checked={ppSettings.trimSilence} onChange={() => togglePp('trimSilence')}>裁剪静音</Checkbox>
                  <Checkbox checked={ppSettings.normalizeLoudness} onChange={() => togglePp('normalizeLoudness')}>响度归一</Checkbox>
                </Space>
                <Checkbox checked={ppSettings.keepOriginal} onChange={() => togglePp('keepOriginal')}>保留原始 WAV</Checkbox>
                {!ppSettings.keepOriginal && enableProofreading && (
                  <Text type="warning" style={{ fontSize: 12 }}>未保留原始，转写将使用压缩后音频，可能影响识别精度</Text>
                )}
              </Space>
            </Card>

            <Card size="small">
              <Checkbox checked={enableProofreading} onChange={(e) => setEnableProofreading(e.target.checked)}>
                同时创建高精度转写（使用原始 WAV）
              </Checkbox>
            </Card>

            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Button danger onClick={handleDiscard}>放弃</Button>
              <Button type="primary" onClick={handleSave}>
                {hasAnyPostProcessing ? '处理并保存' : '保存录音'}
              </Button>
            </div>
          </>
        )}

        {/* ===== 阶段③ 处理中 ===== */}
        {stage === 'processing' && originalFile && (
          <>
            <Card size="small" title="原始录音（处理中可试听）">
              <AudioPlayer filePath={originalFile.path} />
            </Card>
            <Card size="small">
              <Space direction="vertical" style={{ width: '100%' }}>
                <Text>正在处理：{processingSteps}...</Text>
                <Progress percent={Math.round(ppProgress * 100)} status="active" />
              </Space>
            </Card>
          </>
        )}

        {/* ===== 阶段④ 完成 ===== */}
        {stage === 'done' && (
          <>
            {productFile && (
              <Card
                size="small"
                title={
                  <Space>
                    成品
                    {ppFailed && <Tag color="warning">处理失败，使用原始</Tag>}
                    {!ppFailed && originalFile && productFile.size < originalFile.size && (
                      <Tag color="green">
                        {formatSize(productFile.size)} ↓{Math.round((1 - productFile.size / originalFile.size) * 100)}%
                      </Tag>
                    )}
                  </Space>
                }
              >
                <AudioPlayer filePath={productFile.path} />
              </Card>
            )}

            {/* 原始对比试听：保留原始且与成品不同文件时 */}
            {ppSettings.keepOriginal && originalFile && productFile && productFile.path !== originalFile.path && (
              <Card size="small" title={<Space>原始 WAV<Tag>{formatSize(originalFile.size)}</Tag></Space>}>
                <AudioPlayer filePath={originalFile.path} />
              </Card>
            )}

            <Card size="small">
              <Space direction="vertical">
                {saved
                  ? <Space><CheckCircleFilled style={{ color: '#52c41a' }} /><Text>录音已保存</Text></Space>
                  : <Text type="secondary">保存中...</Text>}
                {enableProofreading && createdTaskId && (
                  <Space>
                    <CheckCircleFilled style={{ color: '#52c41a' }} />
                    <Text>转写任务已创建</Text>
                    <Button type="link" size="small" onClick={() => { setPage('taskList') }}>去任务列表</Button>
                  </Space>
                )}
              </Space>
            </Card>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="primary" onClick={() => { reset(); setPage('taskList') }}>完成</Button>
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
          停止后可选择后处理并保存录音。
        </Text>
      </Modal>
    </div>
  )
}
