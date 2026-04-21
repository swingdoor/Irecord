import { useState, useRef, useCallback, useEffect } from 'react'

export type RecordingStatus = 'idle' | 'initializing' | 'recording' | 'paused' | 'stopped'
export type AudioSource = 'microphone' | 'speaker' | 'both'

export interface RecordingSegment {
  text: string
  startTime: number
  endTime: number
}

interface RecordingState {
  status: RecordingStatus
  duration: number
  segments: RecordingSegment[]
  currentText: string
  currentSegmentStartTime: number
  finalText: string
  finalSegments: Array<{ text: string; startTime: number; endTime: number }>
  filePath: string | null
  error: string | null
}

export function useRecording() {
  const [state, setState] = useState<RecordingState>({
    status: 'idle',
    duration: 0,
    segments: [],
    currentText: '',
    currentSegmentStartTime: 0,
    finalText: '',
    finalSegments: [],
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

  const start = useCallback(async (audioSource: AudioSource = 'microphone') => {
    setState(prev => ({ ...prev, status: 'initializing', error: null, segments: [], currentText: '', currentSegmentStartTime: 0, finalText: '', finalSegments: [], filePath: null }))

    try {
      // Get realtime recording settings
      const settings = await window.electronAPI.getSettings()
      const engineConfig = settings.realtimeEngineConfig || {}
      const engine = engineConfig.engine || 'qwen3-simulated-streaming'

      // Get audio gain based on selected engine
      let audioGain = 2.0
      if (engine === 'qwen3-simulated-streaming') {
        audioGain = engineConfig.qwen3Params?.audioGain ?? 2.0
      } else {
        audioGain = engineConfig.zipformerParams?.audioGain ?? settings.realtimeParams?.audioGain ?? 2.0
      }

      console.log('[useRecording] Using engine:', engine, 'with gain:', audioGain)

      // Start recognizer in main process
      const res = await window.electronAPI.startRecording()
      if (res.error) {
        setState(prev => ({ ...prev, status: 'idle', error: res.error! }))
        return
      }

      let mediaStream: MediaStream

      // Get audio stream based on source selection
      if (audioSource === 'microphone') {
        // Microphone only
        const constraints = {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1
          }
        }
        console.log('[useRecording] Requesting microphone with constraints:', constraints)
        mediaStream = await navigator.mediaDevices.getUserMedia(constraints)

        // Verify actual settings applied
        const audioTrack = mediaStream.getAudioTracks()[0]
        const settings = audioTrack.getSettings()
        console.log('[useRecording] Actual audio track settings:', {
          echoCancellation: settings.echoCancellation,
          noiseSuppression: settings.noiseSuppression,
          autoGainControl: settings.autoGainControl,
          sampleRate: settings.sampleRate,
          channelCount: settings.channelCount
        })
      } else if (audioSource === 'speaker') {
        // System audio (speaker) only via Electron desktopCapturer
        console.log('[useRecording] Requesting system audio')
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,  // Required by Electron, will be discarded
          audio: true
        })
        // Remove video track, keep only audio
        displayStream.getVideoTracks().forEach(t => t.stop())
        mediaStream = new MediaStream(displayStream.getAudioTracks())
      } else {
        // Both microphone and speaker
        console.log('[useRecording] Requesting both microphone and system audio')
        const micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1
          }
        })
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        })
        displayStream.getVideoTracks().forEach(t => t.stop())
        const speakerStream = new MediaStream(displayStream.getAudioTracks())

        // Mix both streams
        const audioContext = new AudioContext({ sampleRate: 16000 })
        const micSource = audioContext.createMediaStreamSource(micStream)
        const speakerSource = audioContext.createMediaStreamSource(speakerStream)
        const destination = audioContext.createMediaStreamDestination()

        micSource.connect(destination)
        speakerSource.connect(destination)

        mediaStream = destination.stream
        audioContextRef.current = audioContext
      }

      streamRef.current = mediaStream

      const tracks = mediaStream.getTracks()
      console.log('[useRecording] MediaStream tracks:', tracks.map(t => ({
        kind: t.kind,
        label: t.label,
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState,
        settings: t.getSettings()
      })))

      // Create AudioContext if not already created (for 'both' mode)
      // Use 16kHz for recognition model
      let audioContext = audioContextRef.current
      if (!audioContext) {
        audioContext = new AudioContext({ sampleRate: 16000 })
        audioContextRef.current = audioContext
        console.log('[useRecording] AudioContext created:', {
          sampleRate: audioContext.sampleRate,
          state: audioContext.state
        })
      }

      // Create source only if not in 'both' mode (already created)
      let source = sourceRef.current
      if (!source) {
        source = audioContext.createMediaStreamSource(mediaStream)
        sourceRef.current = source
      }

      // Add gain node to boost audio level
      const gainNode = audioContext.createGain()
      gainNode.gain.value = audioGain
      console.log('[useRecording] Audio gain set to:', audioGain)

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      analyserRef.current = analyser

      // Use AudioWorklet for audio processing
      await audioContext.audioWorklet.addModule('/audio-processor.worklet.js')
      const workletNode = new AudioWorkletNode(audioContext, 'audio-chunk-processor')
      workletNodeRef.current = workletNode

      let chunkCount = 0
      const actualSampleRate = audioContext.sampleRate
      workletNode.port.onmessage = (e) => {
        const channelData = e.data as Float32Array

        // Log first few chunks to verify audio data
        if (chunkCount < 5) {
          console.log(`[useRecording] Received chunk ${chunkCount}:`, {
            length: channelData.length,
            sampleRate: actualSampleRate,
            max: Math.max(...channelData),
            min: Math.min(...channelData)
          })
          chunkCount++
        }

        // Create a new Float32Array to avoid detached buffer issue
        const copy = new Float32Array(channelData.length)
        copy.set(channelData)
        window.electronAPI.sendAudioChunk(copy.buffer)
      }

      // Connect: source -> gainNode -> workletNode (for processing) and source -> analyser (for visualization)
      source.connect(gainNode)
      gainNode.connect(workletNode)
      source.connect(analyser)

      // Listen for results from main process
      const unsubResult = window.electronAPI.onRealtimeResult((data) => {
        if (data.text && data.text.trim()) {
          setState(prev => ({
            ...prev,
            currentText: data.text,
            currentSegmentStartTime: data.startTime
          }))
        }
      })
      const unsubSegment = window.electronAPI.onSegmentComplete((data) => {
        if (data.text && data.text.trim()) {
          console.log('[useRecording] Segment received:', data)
          setState(prev => ({
            ...prev,
            segments: [...prev.segments, {
              text: data.text,
              startTime: data.startTime,
              endTime: data.endTime
            }],
            currentText: '',
            currentSegmentStartTime: data.endTime // Next segment starts at current end time
          }))
        }
      })
      const unsubError = window.electronAPI.onRecordingError((data) => {
        setState(prev => ({ ...prev, error: data.message }))
      })
      cleanupListenersRef.current = [unsubResult, unsubSegment, unsubError]

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
      setState(prev => ({ ...prev, status: 'paused', currentText: '', currentSegmentStartTime: 0 }))
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
        finalText: result.text || '',
        finalSegments: result.segments || [],
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
      segments: [],
      currentText: '',
      currentSegmentStartTime: 0,
      finalText: '',
      finalSegments: [],
      filePath: null,
      error: null,
    })
  }, [cleanup])

  return { state, analyserRef, start, pause, resume, stop, reset }
}
