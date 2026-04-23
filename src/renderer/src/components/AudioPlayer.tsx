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
  /** 原始文件路径 */
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


export const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(({ filePath, onTimeUpdate }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(80)
  const [speed, setSpeed] = useState(1.0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const blobUrlRef = useRef<string | null>(null)
  const mediaRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!containerRef.current || !filePath) return

    console.log('[AudioPlayer] 初始化播放器:', { filePath })

    let destroyed = false

    const init = async () => {
      try {
        setLoading(true)
        setError(null)

        // 获取音频文件为 Blob
        const res = await window.electronAPI.getAudioBlob(filePath)
        if (destroyed) return

        if (res.error) {
          setError(`加载失败: ${res.error}`)
          setLoading(false)
          return
        }

        if (!res.buffer || !res.mimeType) {
          setError('音频数据无效')
          setLoading(false)
          return
        }

        // 创建 Blob 和 Blob URL
        const blob = new Blob([res.buffer], { type: res.mimeType })
        const blobUrl = URL.createObjectURL(blob)
        blobUrlRef.current = blobUrl

        console.log('[AudioPlayer] Blob URL 创建成功:', blobUrl)

        // 尝试解码峰值数据
        let peaks: Float32Array | null = null
        try {
          const base64Res = await window.electronAPI.readFileBuffer(filePath)
          if (base64Res.base64 && !destroyed) {
            peaks = await decodePeaks(base64Res.base64, 500)
          }
        } catch (err) {
          console.warn('[AudioPlayer] 读取音频峰值失败:', err)
        }

        if (destroyed) {
          URL.revokeObjectURL(blobUrl)
          return
        }

        const media = document.createElement('audio')
        media.src = blobUrl
        media.preload = 'auto'
        mediaRef.current = media

        console.log('[AudioPlayer] 创建 audio 元素')

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

        ws.on('ready', () => {
          if (!destroyed) {
            console.log('[AudioPlayer] 播放器就绪')
            setDuration(ws.getDuration())
            setError(null)
            setLoading(false)
          }
        })
        ws.on('timeupdate', (t) => { if (!destroyed) { setCurrentTime(t); onTimeUpdate?.(t) } })
        ws.on('play', () => { if (!destroyed) setPlaying(true) })
        ws.on('pause', () => { if (!destroyed) setPlaying(false) })
        ws.on('finish', () => { if (!destroyed) setPlaying(false) })
        ws.on('error', (err) => {
          console.error('[AudioPlayer] 播放错误:', err)
          if (!destroyed) {
            setError(`播放错误: ${err?.message || '未知错误'}`)
            setLoading(false)
          }
        })

        // 监听 audio 元素的错误
        media.addEventListener('error', (e) => {
          console.error('[AudioPlayer] audio 元素错误:', e, media.error)
          if (!destroyed && media.error) {
            const errorMessages: Record<number, string> = {
              1: '音频加载被中止',
              2: '网络错误导致音频加载失败',
              3: '音频解码失败，可能是格式不支持',
              4: '音频文件不存在或无法访问'
            }
            setError(errorMessages[media.error.code] || `音频加载失败 (错误代码: ${media.error.code})`)
            setLoading(false)
          }
        })

        ws.setVolume(volume / 100)
        wsRef.current = ws
      } catch (err: any) {
        console.error('[AudioPlayer] 初始化失败:', err)
        if (!destroyed) {
          setError(`初始化失败: ${err.message || '未知错误'}`)
          setLoading(false)
        }
      }
    }

    init()

    return () => {
      destroyed = true
      // 停止播放并清理 audio 元素
      if (mediaRef.current) {
        mediaRef.current.pause()
        mediaRef.current.src = ''
        mediaRef.current = null
      }
      wsRef.current?.destroy()
      wsRef.current = null
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [filePath])

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
      <div ref={containerRef} style={{ marginBottom: 12, minHeight: 48, position: 'relative' }}>
        {loading && !error && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#999',
            fontSize: 13,
            backgroundColor: '#fafafa',
            borderRadius: 6
          }}>
            加载中...
          </div>
        )}
        {error && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#999',
            fontSize: 13,
            backgroundColor: '#fafafa',
            borderRadius: 6
          }}>
            {error}
          </div>
        )}
      </div>
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
