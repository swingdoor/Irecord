import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react'
import { Button, Slider, Space, Typography, Dropdown } from 'antd'
import { PlayCircleOutlined, PauseCircleOutlined, SoundOutlined } from '@ant-design/icons'
import WaveSurfer from 'wavesurfer.js'

const { Text } = Typography

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]

export interface AudioPlayerHandle {
  seekTo: (time: number) => void
  getCurrentTime: () => number
}

interface AudioPlayerProps {
  /** local-file:// URL for playback */
  url: string
  /** original file path for reading buffer to decode peaks */
  filePath: string
  onTimeUpdate?: (time: number) => void
}

/** Decode audio buffer to peaks array using Web Audio API */
async function decodePeaks(base64: string, samples: number): Promise<Float32Array | null> {
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const audioCtx = new AudioContext()
    const decoded = await audioCtx.decodeAudioData(bytes.buffer)
    audioCtx.close()
    const raw = decoded.getChannelData(0)
    const step = Math.max(1, Math.floor(raw.length / samples))
    const peaks = new Float32Array(samples)
    for (let i = 0; i < samples; i++) {
      let max = 0
      const start = i * step
      for (let j = start; j < start + step && j < raw.length; j++) {
        const v = Math.abs(raw[j])
        if (v > max) max = v
      }
      peaks[i] = max
    }
    return peaks
  } catch {
    return null
  }
}


export const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(({ url, filePath, onTimeUpdate }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(80)
  const [speed, setSpeed] = useState(1.0)
  const [convertedUrl, setConvertedUrl] = useState<string | null>(null)
  const [converting, setConverting] = useState(false)

  const actualUrl = convertedUrl || url

  useEffect(() => {
    if (!containerRef.current || !actualUrl) return

    let destroyed = false

    const init = async () => {
      // Try to read file and decode real peaks
      let peaks: Float32Array | null = null
      try {
        const res = await window.electronAPI.readFileBuffer(filePath)
        if (res.base64 && !destroyed) {
          peaks = await decodePeaks(res.base64, 500)
        }
      } catch { /* ignore */ }

      if (destroyed) return

      const media = document.createElement('audio')
      media.src = actualUrl
      media.preload = 'auto'

      const ws = WaveSurfer.create({
        container: containerRef.current!,
        waveColor: '#d1d5db',
        progressColor: '#1677ff',
        cursorColor: '#1677ff',
        height: 48,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        media,
        ...(peaks ? { peaks: [peaks] } : {}),
      })

      ws.on('ready', () => { if (!destroyed) setDuration(ws.getDuration()) })
      ws.on('timeupdate', (t) => { if (!destroyed) { setCurrentTime(t); onTimeUpdate?.(t) } })
      ws.on('play', () => { if (!destroyed) setPlaying(true) })
      ws.on('pause', () => { if (!destroyed) setPlaying(false) })
      ws.on('finish', () => { if (!destroyed) setPlaying(false) })
      ws.on('error', async () => {
        // 原始文件播放失败，尝试转换为 WAV
        if (!destroyed && !convertedUrl && !converting) {
          setConverting(true)
          ws.destroy()
          wsRef.current = null
          const res = await window.electronAPI.convertForPlayback(filePath)
          if (!destroyed && res.url) {
            setConvertedUrl(res.url)
          }
          setConverting(false)
        }
      })

      ws.setVolume(volume / 100)
      wsRef.current = ws
    }

    init()

    return () => {
      destroyed = true
      wsRef.current?.destroy()
      wsRef.current = null
    }
  }, [actualUrl, filePath])

  useEffect(() => { wsRef.current?.setVolume(volume / 100) }, [volume])
  useEffect(() => { wsRef.current?.setPlaybackRate(speed) }, [speed])

  const togglePlay = useCallback(() => { wsRef.current?.playPause() }, [])

  useImperativeHandle(ref, () => ({
    seekTo: (time: number) => {
      const ws = wsRef.current
      if (ws) {
        const d = ws.getDuration()
        if (d > 0) { ws.seekTo(time / d); ws.play() }
      }
    },
    getCurrentTime: () => wsRef.current?.getCurrentTime() || 0,
  }))

  return (
    <div style={{ padding: '16px 0' }}>
      {converting && (
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#999' }}>
          正在转换音频格式以支持播放...
        </div>
      )}
      <div ref={containerRef} style={{ marginBottom: 12, minHeight: 48 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button
          type="text"
          icon={playing ? <PauseCircleOutlined style={{ fontSize: 28 }} /> : <PlayCircleOutlined style={{ fontSize: 28 }} />}
          onClick={togglePlay}
          style={{ padding: 0, height: 32, width: 32 }}
        />
        <Text type="secondary" style={{ fontSize: 13, minWidth: 100 }}>
          {formatTime(currentTime)} / {formatTime(duration)}
        </Text>
        <Space size={8} style={{ marginLeft: 'auto' }}>
          <SoundOutlined />
          <Slider
            min={0} max={100} value={volume}
            onChange={setVolume}
            style={{ width: 80, margin: 0 }}
            tooltip={{ formatter: v => `${v}%` }}
          />
          <Dropdown
            menu={{
              items: SPEED_OPTIONS.map(s => ({ key: String(s), label: `${s}x` })),
              onClick: ({ key }) => setSpeed(Number(key)),
              selectedKeys: [String(speed)],
            }}
            trigger={['click']}
          >
            <Button size="small">{speed}x</Button>
          </Dropdown>
        </Space>
      </div>
    </div>
  )
})

AudioPlayer.displayName = 'AudioPlayer'
