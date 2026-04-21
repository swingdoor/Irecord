import { useEffect, useRef } from 'react'
import { Typography } from 'antd'

const { Text } = Typography

interface RealtimeTranscriptProps {
  segments: Array<{ text: string; startTime?: number; endTime?: number }>
  currentText: string
  isRecording: boolean
  isPaused?: boolean
  currentDuration?: number
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function RealtimeTranscript({ segments, currentText, isRecording, isPaused = false, currentDuration = 0 }: RealtimeTranscriptProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [segments, currentText])

  const hasContent = segments.length > 0 || currentText

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: 12,
        borderRadius: 6,
        backgroundColor: 'var(--ant-color-bg-container, #fff)',
        minHeight: 200,
      }}
    >
      {!hasContent && (
        <Text type="secondary" style={{ fontStyle: 'italic' }}>
          {isRecording ? '等待语音输入...' : isPaused ? '录音已暂停' : '点击开始录音'}
        </Text>
      )}

      {segments.map((seg, i) => (
        <div key={i} style={{ marginBottom: 16 }}>
          <Text type="secondary" style={{ fontFamily: 'monospace', fontSize: 12 }}>
            [{formatTime(seg.startTime || 0)}]-[{formatTime(seg.endTime || 0)}]
          </Text>
          <div style={{ marginTop: 4, lineHeight: 1.6 }}>
            <Text>{seg.text}</Text>
          </div>
        </div>
      ))}

      {currentText && !isPaused && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ marginTop: 4, lineHeight: 1.6 }}>
            <Text>{currentText}</Text>
            <span
              style={{
                display: 'inline-block',
                width: 2,
                height: 16,
                backgroundColor: '#ff4d4f',
                marginLeft: 2,
                verticalAlign: 'text-bottom',
                animation: 'blink 1s step-end infinite',
              }}
            />
            <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}
