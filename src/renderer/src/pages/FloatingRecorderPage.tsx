import { useCallback, useState, useEffect, useRef } from 'react'
import { Button, Space, Typography, message } from 'antd'
import { PauseCircleOutlined, PlayCircleOutlined, StopOutlined } from '@ant-design/icons'
import { WaveformVisualizer } from '../components/WaveformVisualizer'
import { RecordingSaveDialog } from '../components/RecordingSaveDialog'

const { Text } = Typography

type PageMode = 'recording' | 'saving'

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

export default function FloatingRecorderPage() {
  const [mode, setMode] = useState<PageMode>('recording')
  const [status, setStatus] = useState<'initializing' | 'recording' | 'paused'>('initializing')
  const [duration, setDuration] = useState(0)
  const [recordingTitle] = useState(() => generateRecordingTitle())
  const [recordingResult, setRecordingResult] = useState<any>(null)

  const audioContextRef = useRef<AudioContext | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const pausedDurationRef = useRef<number>(0)
  const pauseStartRef = useRef<number>(0)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const cleanupListenersRef = useRef<Array<() => void>>([])
  const hasStartedRef = useRef(false)

  const isRecording = status === 'recording'
  const isPaused = status === 'paused'

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    workletNodeRef.current?.disconnect()
    sourceRef.current?.disconnect()
    analyserRef.current?.disconnect()
    audioContextRef.current?.close()
    streamRef.current?.getTracks().forEach(t => t.stop())
    workletNodeRef.current = null
    sourceRef.current = null
    analyserRef.current = null
    audioContextRef.current = null
    streamRef.current = null
    cleanupListenersRef.current.forEach(fn => fn())
    cleanupListenersRef.current = []
    hasStartedRef.current = false
  }, [])

  const stopRecording = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    workletNodeRef.current?.disconnect()
    sourceRef.current?.disconnect()
    analyserRef.current?.disconnect()
    streamRef.current?.getTracks().forEach(t => t.stop())

    const result = await window.electronAPI.stopFloatingRecording()

    cleanupListenersRef.current.forEach(fn => fn())
    cleanupListenersRef.current = []
    audioContextRef.current?.close()
    audioContextRef.current = null

    if (!result.error) {
      setRecordingResult({
        ...result,
        duration: result.duration || duration,
        wordCount: result.text?.length || 0
      })
      setMode('saving')
    } else {
      message.error(result.error)
    }
  }, [duration])

  const startRecording = useCallback(async () => {
    // 防止重复启动（React StrictMode 会 mount 两次）
    if (hasStartedRef.current) return
    hasStartedRef.current = true

    try {
      const settings = await window.electronAPI.getSettings()
      const engineConfig = settings.realtimeEngineConfig || {}
      const engine = engineConfig.engine || 'qwen3-simulated-streaming'
      let audioGain = 2.0
      if (engine === 'qwen3-simulated-streaming') {
        audioGain = engineConfig.qwen3Params?.audioGain ?? 2.0
      } else {
        audioGain = engineConfig.zipformerParams?.audioGain ?? settings.realtimeParams?.audioGain ?? 2.0
      }

      const res = await window.electronAPI.startFloatingRecording()
      if (res.error) {
        message.error(res.error)
        return
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
      })

      streamRef.current = mediaStream
      const audioContext = new AudioContext({ sampleRate: 16000 })
      audioContextRef.current = audioContext
      const source = audioContext.createMediaStreamSource(mediaStream)
      sourceRef.current = source

      const gainNode = audioContext.createGain()
      gainNode.gain.value = audioGain
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      analyserRef.current = analyser

      const workletPath = import.meta.env.DEV
        ? '/audio-processor.worklet.js'
        : new URL('./audio-processor.worklet.js', window.location.href).href
      await audioContext.audioWorklet.addModule(workletPath)
      const workletNode = new AudioWorkletNode(audioContext, 'audio-chunk-processor')
      workletNodeRef.current = workletNode

      workletNode.port.onmessage = (e) => {
        const channelData = e.data as Float32Array
        const copy = new Float32Array(channelData.length)
        copy.set(channelData)
        window.electronAPI.sendAudioChunk(copy.buffer)
      }

      source.connect(gainNode)
      gainNode.connect(workletNode)
      source.connect(analyser)

      startTimeRef.current = Date.now()
      pausedDurationRef.current = 0
      timerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current - pausedDurationRef.current
        setDuration(Math.floor(elapsed / 1000))
      }, 200)

      setStatus('recording')
    } catch (err: any) {
      hasStartedRef.current = false
      cleanup()
      const msg = err.name === 'NotAllowedError' ? '麦克风权限被拒绝' : (err.message || '启动录音失败')
      message.error(msg)
    }
  }, [cleanup])

  const pause = useCallback(() => {
    if (workletNodeRef.current && sourceRef.current) {
      workletNodeRef.current.disconnect()
      sourceRef.current.disconnect()
      analyserRef.current?.disconnect()
      pauseStartRef.current = Date.now()
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      setStatus('paused')
    }
  }, [])

  const resume = useCallback(() => {
    if (sourceRef.current && analyserRef.current && workletNodeRef.current && audioContextRef.current) {
      sourceRef.current.connect(analyserRef.current)
      analyserRef.current.connect(workletNodeRef.current)
      workletNodeRef.current.connect(audioContextRef.current.destination)
      pausedDurationRef.current += Date.now() - pauseStartRef.current
      timerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current - pausedDurationRef.current
        setDuration(Math.floor(elapsed / 1000))
      }, 200)
      setStatus('recording')
    }
  }, [])

  // Auto-start recording on mount
  useEffect(() => {
    startRecording()
    return cleanup
  }, [])

  // Listen for shortcut stop event from main process
  useEffect(() => {
    const unsub = window.electronAPI.onShortcutStopRecording(() => {
      stopRecording()
    })
    return unsub
  }, [stopRecording])

  // Listen for close confirmation request
  useEffect(() => {
    const unsub = window.electronAPI.onRequestCloseConfirmation(() => {
      message.warning('请先停止录音或保存')
    })
    return unsub
  }, [])

  if (mode === 'saving' && recordingResult) {
    return (
      <div style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}>
        <RecordingSaveDialog
          title={recordingTitle}
          duration={recordingResult.duration}
          wordCount={recordingResult.wordCount}
          filePath={recordingResult.filePath}
          text={recordingResult.text}
          segments={recordingResult.segments}
        />
      </div>
    )
  }

  return (
    <div style={{
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Draggable header */}
      <div style={{
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #e8e8e8',
        WebkitAppRegion: 'drag',
        cursor: 'move'
      } as any}>
        <Space size={8}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', backgroundColor: '#ff4d4f',
            display: 'inline-block',
            animation: isRecording ? 'blink 1s step-end infinite' : 'none'
          }} />
          <Text strong style={{ fontSize: 14 }}>{formatDuration(duration)}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {isRecording ? '录音中' : isPaused ? '已暂停' : '初始化...'}
          </Text>
          <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
        </Space>
        <Space size={4} style={{ WebkitAppRegion: 'no-drag' } as any}>
          {isPaused && (
            <Button type="text" size="small" icon={<PlayCircleOutlined />} onClick={resume} />
          )}
          {isRecording && (
            <Button type="text" size="small" icon={<PauseCircleOutlined />} onClick={pause} />
          )}
          <Button type="text" size="small" danger icon={<StopOutlined />} onClick={stopRecording} />
        </Space>
      </div>

      {/* Waveform */}
      <div style={{ flex: 1, padding: '16px', display: 'flex', alignItems: 'center' }}>
        <WaveformVisualizer analyser={analyserRef.current} isActive={isRecording} width={368} height={48} />
      </div>
    </div>
  )
}
