import { useRef, useEffect } from 'react'

interface WaveformVisualizerProps {
  analyser: AnalyserNode | null
  isActive: boolean
  width?: number
  height?: number
}

export function WaveformVisualizer({ analyser, isActive, width = 500, height = 80 }: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Use actual pixel dimensions for sharp rendering
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    const draw = () => {
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, width, height)

      if (!analyser || !isActive) {
        // Draw flat line when not active
        ctx.strokeStyle = '#e8e8e8'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, height / 2)
        ctx.lineTo(width, height / 2)
        ctx.stroke()
        animFrameRef.current = requestAnimationFrame(draw)
        return
      }

      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)
      analyser.getByteTimeDomainData(dataArray)

      // Draw gradient fill under the waveform
      const gradient = ctx.createLinearGradient(0, 0, 0, height)
      gradient.addColorStop(0, 'rgba(255, 77, 79, 0.15)')
      gradient.addColorStop(0.5, 'rgba(255, 77, 79, 0.05)')
      gradient.addColorStop(1, 'rgba(255, 77, 79, 0)')

      // Build path points
      const step = Math.max(1, Math.floor(bufferLength / width))
      const points: Array<{ x: number; y: number }> = []
      for (let i = 0; i < bufferLength; i += step) {
        const v = dataArray[i] / 128.0
        const y = (v * height) / 2
        const x = (i / bufferLength) * width
        points.push({ x, y })
      }

      // Draw filled area
      ctx.beginPath()
      ctx.moveTo(0, height / 2)
      for (const p of points) {
        ctx.lineTo(p.x, p.y)
      }
      ctx.lineTo(width, height / 2)
      ctx.closePath()
      ctx.fillStyle = gradient
      ctx.fill()

      // Draw waveform line
      ctx.beginPath()
      ctx.lineWidth = 2
      ctx.strokeStyle = '#ff4d4f'
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      for (let i = 0; i < points.length; i++) {
        if (i === 0) {
          ctx.moveTo(points[i].x, points[i].y)
        } else {
          // Smooth curve using quadratic bezier
          const prev = points[i - 1]
          const curr = points[i]
          const cpx = (prev.x + curr.x) / 2
          const cpy = (prev.y + curr.y) / 2
          ctx.quadraticCurveTo(prev.x, prev.y, cpx, cpy)
        }
      }
      ctx.stroke()

      animFrameRef.current = requestAnimationFrame(draw)
    }

    animFrameRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [analyser, isActive, width, height])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width: '100%', height, borderRadius: 6 }}
    />
  )
}
