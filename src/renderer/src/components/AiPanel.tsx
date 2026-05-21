import { useState, useCallback } from 'react'
import { Typography, Tabs, Spin, Button, Input, Space, Alert, Empty, Card, Divider, Tooltip, message } from 'antd'
import { SendOutlined, ReloadOutlined, CopyOutlined, DownloadOutlined, UserOutlined, CheckCircleOutlined, QuestionCircleOutlined, MessageOutlined } from '@ant-design/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const { Text, Title, Paragraph } = Typography
const { TextArea } = Input

interface AiPanelProps {
  text: string
  segments?: Array<{ text: string; start: number; end: number; speaker?: string }>
  speakerStats?: Record<string, { segments: number; duration: number }>
  aiSummary?: string | null
  aiSpeakers?: string | null
  aiMinutes?: string | null
  aiQa?: string | null
  taskId: string
}

interface RegenState { loading: boolean; result: string | null; error: string | null }

function tryParseJSON(raw: string | null | undefined): any {
  if (!raw) return null
  let s = raw.trim()
  if (s.startsWith('```')) s = s.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
  try { return JSON.parse(s) } catch { return null }
}

/** Convert structured data to plain text for copy/export */
function toPlainText(type: string, raw: string): string {
  const data = tryParseJSON(raw)
  if (!data) return raw
  switch (type) {
    case 'summary':
      return (data.points || []).map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')
    case 'speakers':
      return (data.speakers || []).map((s: any) =>
        `【${s.name}】\n${(s.points || []).map((p: string) => `  • ${p}`).join('\n')}`
      ).join('\n\n')
    case 'minutes':
      return (data.sections || []).map((s: any) =>
        `${s.heading}\n${(s.items || []).map((item: string) => `  • ${item}`).join('\n')}`
      ).join('\n\n')
    case 'qa':
      return (data.pairs || []).map((p: any, i: number) =>
        `问${i + 1}：${p.question}\n答：${p.answer}`
      ).join('\n\n')
    default: return raw
  }
}

const SPEAKER_COLORS = ['#1677ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96', '#13c2c2']
const scrollStyle: React.CSSProperties = {
  overflow: 'auto',
  scrollbarWidth: 'none', // Firefox
  msOverflowStyle: 'none', // IE/Edge
}

// PLACEHOLDER_RENDERERS

function RenderSummary({ raw }: { raw: string }) {
  const data = tryParseJSON(raw)
  if (!data?.points) return <Alert type="error" message="AI 分析失败" description="请重新生成" showIcon />
  return (
    <Space direction="vertical" size={10} style={{ width: '100%', marginBottom: 16 }}>
      {data.points.map((point: string, i: number) => (
        <Card key={i} size="small" style={{ background: '#fafafa', border: 'none' }}>
          <Space align="start">
            <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 15, marginTop: 2 }} />
            <Text style={{ fontSize: 14, lineHeight: 1.6 }}>{point}</Text>
          </Space>
        </Card>
      ))}
    </Space>
  )
}

function RenderSpeakers({ raw }: { raw: string }) {
  const data = tryParseJSON(raw)
  if (!data?.speakers) return <Alert type="error" message="AI 分析失败" description="请重新生成" showIcon />
  return (
    <Space direction="vertical" size={12} style={{ width: '100%', marginBottom: 16 }}>
      {data.speakers.map((speaker: any, i: number) => (
        <Card
          key={i} size="small"
          title={<Space><UserOutlined style={{ color: SPEAKER_COLORS[i % SPEAKER_COLORS.length] }} /><Text strong>{speaker.name}</Text></Space>}
          style={{ borderColor: '#e8e8e8' }}
          styles={{ header: { borderBottom: '1px solid #f0f0f0', minHeight: 40, padding: '0 16px' }, body: { padding: '12px 16px' } }}
        >
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            {speaker.points?.map((point: string, j: number) => (
              <Text key={j} style={{ fontSize: 14, lineHeight: 1.6, display: 'block' }}>• {point}</Text>
            ))}
          </Space>
        </Card>
      ))}
    </Space>
  )
}

function RenderMinutes({ raw }: { raw: string }) {
  const data = tryParseJSON(raw)
  if (!data?.sections) return <Alert type="error" message="AI 分析失败" description="请重新生成" showIcon />
  return (
    <Space direction="vertical" size={20} style={{ width: '100%', marginBottom: 16 }}>
      {data.sections.map((sec: any, i: number) => (
        <div key={i}>
          <Title level={5} style={{ marginBottom: 10, color: '#1677ff' }}>{sec.heading}</Title>
          <Space direction="vertical" size={6} style={{ width: '100%', paddingLeft: 8 }}>
            {sec.items?.map((item: string, j: number) => (
              <Card key={j} size="small" style={{ background: '#fafafa', border: 'none' }}>
                <Text style={{ fontSize: 14, lineHeight: 1.6 }}>{item}</Text>
              </Card>
            ))}
          </Space>
        </div>
      ))}
    </Space>
  )
}

function RenderQa({ raw }: { raw: string }) {
  const data = tryParseJSON(raw)
  if (!data?.pairs) return <Alert type="error" message="AI 分析失败" description="请重新生成" showIcon />
  return (
    <Space direction="vertical" size={12} style={{ width: '100%', marginBottom: 16 }}>
      {data.pairs.map((pair: any, i: number) => (
        <Card key={i} size="small" style={{ background: '#f6f8fa' }}>
          <Space align="start" style={{ marginBottom: 8 }}>
            <QuestionCircleOutlined style={{ color: '#1677ff', fontSize: 15, marginTop: 2 }} />
            <Text strong style={{ fontSize: 14, color: '#1677ff' }}>{pair.question}</Text>
          </Space>
          <Divider style={{ margin: '8px 0' }} />
          <Space align="start">
            <MessageOutlined style={{ color: '#52c41a', fontSize: 15, marginTop: 2 }} />
            <Text style={{ fontSize: 14, lineHeight: 1.6, color: '#595959' }}>{pair.answer}</Text>
          </Space>
        </Card>
      ))}
    </Space>
  )
}

function RenderAsk({ raw }: { raw: string }) {
  const data = tryParseJSON(raw)
  const answer = data?.answer
  if (!answer) return <Alert type="error" message="AI 分析失败" description="请重新生成" showIcon />

  // 按段落分割（\n\n 或多个换行符）
  const paragraphs = answer.split(/\n\n+/).filter(p => p.trim())

  return (
    <Space direction="vertical" size={12} style={{ width: '100%', marginBottom: 16 }}>
      {paragraphs.map((para, i) => (
        <Card key={i} size="small" style={{ background: '#f6f8fa', border: '1px solid #e8e8e8' }}>
          <Space align="start" style={{ width: '100%' }}>
            <MessageOutlined style={{ color: '#52c41a', fontSize: 15, marginTop: 2, flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 14, lineHeight: 1.8, color: '#262626' }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // 段落
                  p: ({ children }) => <Text style={{ display: 'block', marginBottom: 8 }}>{children}</Text>,
                  // 加粗
                  strong: ({ children }) => <Text strong>{children}</Text>,
                  // 斜体
                  em: ({ children }) => <Text italic>{children}</Text>,
                  // 标题
                  h1: ({ children }) => <Title level={4} style={{ marginTop: 8, marginBottom: 8 }}>{children}</Title>,
                  h2: ({ children }) => <Title level={5} style={{ marginTop: 8, marginBottom: 8 }}>{children}</Title>,
                  h3: ({ children }) => <Text strong style={{ display: 'block', fontSize: 15, marginTop: 8, marginBottom: 8 }}>{children}</Text>,
                  // 无序列表
                  ul: ({ children }) => <ul style={{ marginLeft: 20, marginBottom: 8 }}>{children}</ul>,
                  ol: ({ children }) => <ol style={{ marginLeft: 20, marginBottom: 8 }}>{children}</ol>,
                  li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
                  // 代码
                  code: ({ children }) => <Text code>{children}</Text>,
                  // 引用
                  blockquote: ({ children }) => (
                    <div style={{ borderLeft: '3px solid #d9d9d9', paddingLeft: 12, marginBottom: 8, color: '#595959' }}>
                      {children}
                    </div>
                  ),
                }}
              >
                {para}
              </ReactMarkdown>
            </div>
          </Space>
        </Card>
      ))}
    </Space>
  )
}

export function AiPanel({ text, segments, aiSummary, aiSpeakers, aiMinutes, aiQa, taskId }: AiPanelProps) {
  const [regen, setRegen] = useState<Record<string, RegenState>>({})
  const [question, setQuestion] = useState('')
  const [askLoading, setAskLoading] = useState(false)
  const [askResult, setAskResult] = useState<string | null>(null)
  const [askError, setAskError] = useState<string | null>(null)

  const dbData: Record<string, string | null | undefined> = {
    summary: aiSummary, speakers: aiSpeakers, minutes: aiMinutes, qa: aiQa,
  }

  const regenerate = useCallback(async (type: 'summary' | 'speakers' | 'minutes' | 'qa') => {
    setRegen(prev => ({ ...prev, [type]: { loading: true, result: null, error: null } }))
    try {
      const res = await window.electronAPI.llmAnalyze({ type, text, segments })
      if (res.result) {
        // 写入数据库
        const fieldMap = { summary: 'aiSummary', speakers: 'aiSpeakers', minutes: 'aiMinutes', qa: 'aiQa' } as const
        await window.electronAPI.updateAiAnalysis({ taskId, field: fieldMap[type], value: res.result })
      }
      setRegen(prev => ({ ...prev, [type]: { loading: false, result: res.result || null, error: res.error || null } }))
    } catch (err: any) {
      setRegen(prev => ({ ...prev, [type]: { loading: false, result: null, error: err.message || '生成失败' } }))
    }
  }, [text, segments, taskId])

  const handleCopy = useCallback((type: string) => {
    const content = regen[type]?.result || dbData[type]
    if (!content) return
    navigator.clipboard.writeText(toPlainText(type, content))
    message.success('已复制')
  }, [regen, dbData])

  const handleExport = useCallback(async (type: string, label: string) => {
    const content = regen[type]?.result || dbData[type]
    if (!content) return
    const plainText = toPlainText(type, content)
    await window.electronAPI.exportTxt({ text: plainText, includeTimestamps: false })
  }, [regen, dbData])

  const handleAsk = useCallback(async () => {
    if (!question.trim()) return
    setAskLoading(true); setAskResult(null); setAskError(null)
    const res = await window.electronAPI.llmAnalyze({ type: 'ask', text, question })
    setAskLoading(false)
    if (res.error) setAskError(res.error)
    else setAskResult(res.result || null)
  }, [text, question])

  const handleCopyAsk = useCallback(() => {
    if (!askResult) return
    const data = tryParseJSON(askResult)
    const answer = data?.answer
    if (answer) {
      navigator.clipboard.writeText(answer)
      message.success('已复制')
    }
  }, [askResult])

  const handleExportAsk = useCallback(async () => {
    if (!askResult) return
    const data = tryParseJSON(askResult)
    const answer = data?.answer
    if (answer) {
      await window.electronAPI.exportTxt({ text: answer, includeTimestamps: false })
    }
  }, [askResult])

  const handleRegenerateAsk = useCallback(async () => {
    if (!question.trim()) return
    setAskLoading(true); setAskError(null)
    const res = await window.electronAPI.llmAnalyze({ type: 'ask', text, question })
    setAskLoading(false)
    if (res.error) setAskError(res.error)
    else setAskResult(res.result || null)
  }, [text, question])

  const renderers: Record<string, (raw: string) => JSX.Element> = {
    summary: (raw) => <RenderSummary raw={raw} />,
    speakers: (raw) => <RenderSpeakers raw={raw} />,
    minutes: (raw) => <RenderMinutes raw={raw} />,
    qa: (raw) => <RenderQa raw={raw} />,
  }

  const renderTab = (type: 'summary' | 'speakers' | 'minutes' | 'qa', label: string) => {
    const regenState = regen[type]
    const content = regenState?.result || dbData[type]
    const loading = regenState?.loading
    const error = regenState?.error
    const hasContent = !loading && !!content

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        {hasContent && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8, gap: 4 }}>
            <Tooltip title="重新生成"><Button type="text" size="small" icon={<ReloadOutlined />} onClick={() => regenerate(type)} /></Tooltip>
            <Tooltip title="复制"><Button type="text" size="small" icon={<CopyOutlined />} onClick={() => handleCopy(type)} /></Tooltip>
            <Tooltip title="导出 TXT"><Button type="text" size="small" icon={<DownloadOutlined />} onClick={() => handleExport(type, label)} /></Tooltip>
          </div>
        )}
        <div className="ai-scroll-area" style={{ flex: 1, ...scrollStyle }}>
          {loading && <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" tip="AI 分析中..." /></div>}
          {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
          {hasContent && renderers[type](content!)}
          {!loading && !content && !error && (
            <Empty description={`${label}尚未生成`} style={{ padding: '60px 0' }}>
              <Button type="primary" onClick={() => regenerate(type)}>立即生成</Button>
            </Empty>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Title level={5} style={{ marginBottom: 16 }}>AI 智能分析</Title>
      <Tabs
        className="ai-panel-tabs"
        style={{ flex: 1 }}
        items={[
          { key: 'summary', label: '摘要', children: renderTab('summary', '摘要') },
          { key: 'speakers', label: '发言人', children: renderTab('speakers', '发言人总结') },
          { key: 'minutes', label: '纪要', children: renderTab('minutes', '会议纪要') },
          { key: 'qa', label: '问答', children: renderTab('qa', '问答总结') },
          {
            key: 'ask', label: '提问',
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                <Space.Compact style={{ marginBottom: 12, width: '100%' }}>
                  <TextArea
                    value={question} onChange={e => setQuestion(e.target.value)}
                    placeholder="输入你的问题..."
                    autoSize={{ minRows: 1, maxRows: 4 }}
                    onPressEnter={e => { if (!e.shiftKey) { e.preventDefault(); handleAsk() } }}
                    style={{ flex: 1 }}
                  />
                  <Button type="primary" icon={<SendOutlined />} onClick={handleAsk} loading={askLoading} style={{ height: 'auto' }} />
                </Space.Compact>
                {askResult && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8, gap: 4 }}>
                    <Tooltip title="重新生成"><Button type="text" size="small" icon={<ReloadOutlined />} onClick={handleRegenerateAsk} /></Tooltip>
                    <Tooltip title="复制"><Button type="text" size="small" icon={<CopyOutlined />} onClick={handleCopyAsk} /></Tooltip>
                    <Tooltip title="导出 TXT"><Button type="text" size="small" icon={<DownloadOutlined />} onClick={handleExportAsk} /></Tooltip>
                  </div>
                )}
                <div className="ai-scroll-area" style={{ flex: 1, ...scrollStyle }}>
                  {askLoading && <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" tip="思考中..." /></div>}
                  {askError && <Alert type="error" message={askError} showIcon />}
                  {askResult && <RenderAsk raw={askResult} />}
                </div>
              </div>
            ),
          },
        ]}
      />
      <style>{`
        .ai-panel-tabs.ant-tabs {
          display: flex !important;
          flex-direction: column !important;
          height: 100% !important;
        }
        .ai-panel-tabs .ant-tabs-nav {
          flex-shrink: 0 !important;
          margin-bottom: 16px !important;
        }
        .ai-panel-tabs .ant-tabs-content-holder {
          flex: 1 !important;
          overflow: hidden !important;
          min-height: 0 !important;
        }
        .ai-panel-tabs .ant-tabs-content {
          height: 100% !important;
        }
        .ai-panel-tabs .ant-tabs-tabpane {
          height: 100% !important;
        }
        .ai-scroll-area::-webkit-scrollbar {
          display: none !important;
        }
      `}</style>
    </div>
  )
}
