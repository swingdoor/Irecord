import { useState, useEffect, useRef, useMemo } from 'react'
import { Typography, Tag, Input, Space, Avatar } from 'antd'
import { SearchOutlined } from '@ant-design/icons'

const { Text } = Typography

const SPEAKER_COLORS = ['#1677ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96', '#13c2c2', '#faad14', '#2f54eb']

interface Segment {
  text: string
  start: number
  end: number
  speaker?: string
}

interface TranscriptPanelProps {
  segments: Segment[]
  keywords: Array<{ word: string; score: number }>
  speakerStats?: Record<string, { segments: number; duration: number }>
  currentTime: number
  onSeek: (time: number) => void
}

function formatTimestamp(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function TranscriptPanel({ segments, keywords, currentTime, onSeek }: TranscriptPanelProps) {
  const [search, setSearch] = useState('')
  const [activeKeyword, setActiveKeyword] = useState<string | null>(null)
  const activeRef = useRef<HTMLDivElement>(null)

  const speakerList = useMemo(() => {
    const set = new Set<string>()
    segments.forEach(s => { if (s.speaker) set.add(s.speaker) })
    return [...set]
  }, [segments])

  const getSpeakerColor = (speaker?: string) => {
    if (!speaker) return '#999'
    const idx = speakerList.indexOf(speaker)
    return SPEAKER_COLORS[idx % SPEAKER_COLORS.length]
  }

  const activeIndex = useMemo(() => {
    for (let i = segments.length - 1; i >= 0; i--) {
      if (currentTime >= segments[i].start) return i
    }
    return -1
  }, [currentTime, segments])

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeIndex])

  const highlightText = (text: string) => {
    const kw = activeKeyword || search
    if (!kw) return text
    const parts: Array<{ text: string; hl: boolean }> = []
    let remaining = text
    const lower = kw.toLowerCase()
    while (remaining.length > 0) {
      const idx = remaining.toLowerCase().indexOf(lower)
      if (idx === -1) { parts.push({ text: remaining, hl: false }); break }
      if (idx > 0) parts.push({ text: remaining.slice(0, idx), hl: false })
      parts.push({ text: remaining.slice(idx, idx + kw.length), hl: true })
      remaining = remaining.slice(idx + kw.length)
    }
    return (
      <>{parts.map((p, i) => p.hl ? <mark key={i} style={{ background: '#ffe58f', padding: '0 1px' }}>{p.text}</mark> : <span key={i}>{p.text}</span>)}</>
    )
  }

  const filtered = search
    ? segments.filter(s => s.text.toLowerCase().includes(search.toLowerCase()))
    : segments

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: 12 }}>
        <Input
          placeholder="搜索转写内容..."
          prefix={<SearchOutlined />}
          value={search}
          onChange={e => { setSearch(e.target.value); setActiveKeyword(null) }}
          allowClear
        />
      </div>

      {keywords.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Space size={[4, 8]} wrap>
            <Text type="secondary" style={{ fontSize: 12 }}>关键词</Text>
            {keywords.map(kw => (
              <Tag
                key={kw.word}
                color={activeKeyword === kw.word ? 'blue' : undefined}
                style={{ cursor: 'pointer' }}
                onClick={() => { setActiveKeyword(activeKeyword === kw.word ? null : kw.word); setSearch('') }}
              >
                {kw.word}
              </Tag>
            ))}
          </Space>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto' }}>
        {filtered.map((seg, index) => {
          const isActive = !search && index === activeIndex
          const realIndex = search ? segments.indexOf(seg) : index
          return (
            <div
              key={realIndex}
              ref={isActive ? activeRef : undefined}
              onClick={() => onSeek(seg.start)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                borderRadius: 6,
                background: isActive ? '#e6f4ff' : 'transparent',
                transition: 'background 0.2s',
                marginBottom: 2,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                {seg.speaker && (
                  <Avatar size={20} style={{ backgroundColor: getSpeakerColor(seg.speaker), fontSize: 10 }}>
                    {seg.speaker.replace(/[^0-9]/g, '') || seg.speaker[0]}
                  </Avatar>
                )}
                {seg.speaker && <Text strong style={{ fontSize: 12, color: getSpeakerColor(seg.speaker) }}>{seg.speaker}</Text>}
                <Text type="secondary" style={{ fontSize: 11 }}>{formatTimestamp(seg.start)}</Text>
              </div>
              <Text style={{ fontSize: 14, lineHeight: 1.6 }}>{highlightText(seg.text)}</Text>
            </div>
          )
        })}
      </div>
    </div>
  )
}
