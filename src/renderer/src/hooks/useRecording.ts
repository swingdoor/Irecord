import { useState, useRef, useCallback, useEffect } from 'react'

export type RecordingStatus = 'idle' | 'initializing' | 'recording' | 'paused' | 'stopped'

export interface RecordingSegment {
  text: string
  startTime: number
  endTime: number
}

interface RecordingState {
  status: RecordingStatus
  duration: number
  filePath: string | null
  error: string | null
}

export function useRecording() {
  const [state, setState] = useState<RecordingState>({
    status: 'idle',
    duration: 0,
    filePath: null,
    error: null,
  })

  const audioContextRef = useRef<AudioContext | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const pausedDurationRef = useRef<number>(0)
  const pauseStartRef = useRef<number>(0)
  const analyserRef = useRef<AnalyserNode | null>(null)

  // Cleanup IPC listeners
  const cleanupListenersRef = useRef<Array<() => void>>([])

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
  }, [])

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup])

  const start = useCallback(async () => {
    setState(prev => ({ ...prev, status: 'initializing', error: null, filePath: null }))

    try {
      // 录音采集固定增益（不再依赖已移除的实时引擎设置）
      const audioGain = 2.0

      // Start recorder in main process
      const res = await window.electronAPI.startRecording()
      if (res.error) {
        setState(prev => ({ ...prev, status: 'idle', error: res.error! }))
        return
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1
        }
      })

      streamRef.current = mediaStream

      // Create AudioContext at 16kHz for recognition model
      const audioContext = new AudioContext({ sampleRate: 16000 })
      audioContextRef.current = audioContext

      const source = audioContext.createMediaStreamSource(mediaStream)
      sourceRef.current = source

      // Add gain node to boost audio level
      const gainNode = audioContext.createGain()
      gainNode.gain.value = audioGain

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      analyserRef.current = analyser

      // Use AudioWorklet for audio processing
      // 开发模式用绝对路径，打包后用相对于 index.html 的路径
      const workletPath = import.meta.env.DEV
        ? '/audio-processor.worklet.js'
        : new URL('./audio-processor.worklet.js', window.location.href).href
      await audioContext.audioWorklet.addModule(workletPath)
      const workletNode = new AudioWorkletNode(audioContext, 'audio-chunk-processor')
      workletNodeRef.current = workletNode

      workletNode.port.onmessage = (e) => {
        const channelData = e.data as Float32Array

        // Create a new Float32Array to avoid detached buffer issue
        const copy = new Float32Array(channelData.length)
        copy.set(channelData)
        window.electronAPI.sendAudioChunk(copy.buffer)
      }

      // Connect: source -> gainNode -> workletNode (for processing) and source -> analyser (for visualization)
      source.connect(gainNode)
      gainNode.connect(workletNode)
      source.connect(analyser)

      // Listen for errors from main process
      const unsubError = window.electronAPI.onRecordingError((data) => {
        setState(prev => ({ ...prev, error: data.message }))
      })
      cleanupListenersRef.current = [unsubError]

      // Start timer
      startTimeRef.current = Date.now()
      pausedDurationRef.current = 0
      timerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current - pausedDurationRef.current
        setState(prev => ({ ...prev, duration: Math.floor(elapsed / 1000) }))
      }, 200)

      setState(prev => ({ ...prev, status: 'recording' }))
    } catch (err: any) {
      cleanup()
      const msg = err.name === 'NotAllowedError' ? '麦克风权限被拒绝，请在系统设置中允许访问麦克风' : (err.message || '启动录音失败')
      setState(prev => ({ ...prev, status: 'idle', error: msg }))
    }
  }, [cleanup])

  const pause = useCallback(() => {
    if (workletNodeRef.current && sourceRef.current) {
      workletNodeRef.current.disconnect()
      sourceRef.current.disconnect()
      analyserRef.current?.disconnect()
      pauseStartRef.current = Date.now()

      // Stop the timer during pause
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }

      // Clear current text when pausing
      setState(prev => ({ ...prev, status: 'paused' }))
    }
  }, [])

  const resume = useCallback(() => {
    if (sourceRef.current && analyserRef.current && workletNodeRef.current && audioContextRef.current) {
      sourceRef.current.connect(analyserRef.current)
      analyserRef.current.connect(workletNodeRef.current)
      workletNodeRef.current.connect(audioContextRef.current.destination)
      pausedDurationRef.current += Date.now() - pauseStartRef.current

      // Restart the timer
      timerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current - pausedDurationRef.current
        setState(prev => ({ ...prev, duration: Math.floor(elapsed / 1000) }))
      }, 200)

      setState(prev => ({ ...prev, status: 'recording' }))
    }
  }, [])

  const stop = useCallback(async () => {
    // Stop audio capture first
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    workletNodeRef.current?.disconnect()
    sourceRef.current?.disconnect()
    analyserRef.current?.disconnect()
    streamRef.current?.getTracks().forEach(t => t.stop())

    // Get final result from main process
    const result = await window.electronAPI.stopRecording()

    cleanupListenersRef.current.forEach(fn => fn())
    cleanupListenersRef.current = []
    audioContextRef.current?.close()
    audioContextRef.current = null

    if (result.error) {
      setState(prev => ({ ...prev, status: 'stopped', error: result.error! }))
      return null
    } else {
      setState(prev => ({
        ...prev,
        status: 'stopped',
        filePath: result.filePath || null,
      }))
      return result
    }
  }, [])

  const reset = useCallback(() => {
    cleanup()
    setState({
      status: 'idle',
      duration: 0,
      filePath: null,
      error: null,
    })
  }, [cleanup])

  return { state, analyserRef, start, pause, resume, stop, reset }
}
