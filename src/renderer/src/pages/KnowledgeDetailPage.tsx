import { useEffect, useState, useCallback, useRef } from 'react'
import { Button, Input, Space, Typography, Spin, Dropdown, App } from 'antd'
import { ArrowLeftOutlined, DownloadOutlined, CopyOutlined } from '@ant-design/icons'
import { useAppStore } from '../stores/appStore'
import { TipTapEditor } from '../components/TipTapEditor'

const { Text, Title } = Typography

export default function KnowledgeDetailPage() {
  const { message } = App.useApp()
  const { currentKnowledgeDocId, setPage, refreshKnowledgeDocs, tasks, realtimeRecordings, templates } = useAppStore()
  const [doc, setDoc] = useState<any>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const titleRef = useRef(title)
  const contentRef = useRef(content)
  const docRef = useRef(doc)

  titleRef.current = title
  contentRef.current = content
  docRef.current = doc

  useEffect(() => {
    if (!currentKnowledgeDocId) {
      setPage('taskList')
      return
    }
    window.electronAPI.getKnowledgeDoc(currentKnowledgeDocId).then(res => {
      if (res.error || !res.doc) {
        message.error(res.error || '文档不存在')
        setPage('taskList')
      } else {
        setDoc(res.doc)
        setTitle(res.doc.title)
        setContent(res.doc.content)
        setLastSaved(res.doc.updatedAt)
        setLoading(false)
      }
    })
  }, [currentKnowledgeDocId, setPage, message])

  const triggerAutoSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      if (!docRef.current) return
      await window.electronAPI.updateKnowledgeDoc({
        docId: docRef.current.id,
        title: titleRef.current,
        content: contentRef.current,
      })
      setLastSaved(new Date().toISOString())
      refreshKnowledgeDocs()
    }, 2000)
  }, [refreshKnowledgeDocs])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      if (docRef.current) {
        window.electronAPI.updateKnowledgeDoc({
          docId: docRef.current.id,
          title: titleRef.current,
          content: contentRef.current,
        })
      }
    }
  }, [])

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value)
    triggerAutoSave()
  }

  const handleContentChange = (val: string) => {
    setContent(val)
    triggerAutoSave()
  }

  const handleCopy = useCallback(() => {
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = content
    const plainText = tempDiv.innerText
    const blob = new Blob([content], { type: 'text/html' })
    const textBlob = new Blob([plainText], { type: 'text/plain' })
    navigator.clipboard.write([
      new ClipboardItem({
        'text/html': blob,
        'text/plain': textBlob,
      })
    ]).then(() => {
      message.success('已复制到剪贴板')
    }).catch(() => {
      message.error('复制失败')
    })
  }, [content, message])

  const handleExport = useCallback(async (format: 'md' | 'txt' | 'pdf') => {
    if (!doc) return
    const fns = {
      md: window.electronAPI.exportKnowledgeMarkdown,
      txt: window.electronAPI.exportKnowledgeTxt,
      pdf: window.electronAPI.exportKnowledgePdf,
    }
    const res = await fns[format]({ title, content })
    if (res.error) message.error(res.error)
    else if (!res.canceled) message.success('导出成功')
  }, [doc, title, content, message])

  const getSourceNames = useCallback(() => {
    if (!doc) return []
    try {
      const sourceIds = JSON.parse(doc.sourceIds)
      return sourceIds.map((src: { type: string; id: string }) => {
        if (src.type === 'task') {
          const task = tasks.find(t => t.id === src.id)
          return task ? task.fileName : '已删除'
        } else {
          const rec = realtimeRecordings.find(r => r.id === src.id)
          return rec ? rec.title : '已删除'
        }
      })
    } catch { return [] }
  }, [doc, tasks, realtimeRecordings])

  const getTemplateName = useCallback(() => {
    if (!doc) return ''
    const tpl = templates.find(t => t.id === doc.templateId)
    return tpl?.name || '未知模板'
  }, [doc, templates])

  const formatSavedTime = (iso: string) => {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  // 从 HTML 内容提取纯文本并统计字数（去标签、去空白，与转写字数口径一致）
  const getWordCount = (html: string): number => {
    if (!html) return 0
    const tmp = document.createElement('div')
    tmp.innerHTML = html
    return (tmp.textContent || '').replace(/\s/g, '').length
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!doc) return null

  const exportMenuItems = [
    { key: 'md', label: '导出 Markdown' },
    { key: 'txt', label: '导出 TXT' },
    { key: 'pdf', label: '导出 PDF' },
  ]

  const extraActions = (
    <Space>
      <Button type="text" icon={<CopyOutlined />} onClick={handleCopy}>复制</Button>
      <Dropdown menu={{ items: exportMenuItems, onClick: ({ key }) => handleExport(key as 'md' | 'txt' | 'pdf') }}>
        <Button type="text" icon={<DownloadOutlined />}>导出</Button>
      </Dropdown>
    </Space>
  )

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 30px)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
        <Space>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => setPage('taskList')} />
          <div>
            <Input
              value={title}
              onChange={handleTitleChange}
              placeholder="文档标题"
              style={{ fontSize: 16, fontWeight: 500, padding: 0 }}
              variant="borderless"
            />
            <Space size={16} style={{ fontSize: 12 }}>
              <Text type="secondary">来源: {getSourceNames().join(' · ')}</Text>
              <Text type="secondary">模板: {getTemplateName()}</Text>
              <Text type="secondary">字数: {getWordCount(content).toLocaleString()}</Text>
              {lastSaved && <Text type="secondary">上次保存: {formatSavedTime(lastSaved)}</Text>}
            </Space>
          </div>
        </Space>
      </div>

      <div style={{ flex: 1, border: '1px solid #d9d9d9', borderRadius: 6, padding: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <TipTapEditor value={content} onChange={handleContentChange} extraActions={extraActions} />
      </div>
    </div>
  )
}
