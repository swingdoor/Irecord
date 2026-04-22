import { useEffect, useCallback, useState, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenuPlugin } from '@tiptap/extension-bubble-menu'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import Link from '@tiptap/extension-link'
import { Button, Space, Tooltip, App, Card } from 'antd'
import {
  BoldOutlined, ItalicOutlined, UnderlineOutlined, StrikethroughOutlined,
  OrderedListOutlined, UnorderedListOutlined, MinusOutlined,
  UndoOutlined, RedoOutlined, LinkOutlined,
  CheckOutlined, CloseOutlined, ReloadOutlined, LoadingOutlined,
  HighlightOutlined, SwapOutlined, ExpandOutlined, EnterOutlined,
} from '@ant-design/icons'

interface TipTapEditorProps {
  value: string
  onChange: (value: string) => void
  extraActions?: React.ReactNode
}

type PolishType = 'polish' | 'rewrite' | 'expand'

export function TipTapEditor({ value, onChange, extraActions }: TipTapEditorProps) {
  const { message } = App.useApp()
  const [polishing, setPolishing] = useState(false)
  const [polishResult, setPolishResult] = useState<{ original: string; result: string; type: PolishType; from: number; to: number } | null>(null)
  const lastPolishTypeRef = useRef<PolishType>('polish')
  const bubbleRef = useRef<HTMLDivElement>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] } }),
      Underline,
      Placeholder.configure({ placeholder: '在此编辑文档内容...' }),
      Link.configure({ openOnClick: false }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })

  // 注册 BubbleMenuPlugin
  useEffect(() => {
    if (!editor || !bubbleRef.current) return
    const plugin = BubbleMenuPlugin({
      pluginKey: 'aiPolishBubble',
      editor,
      element: bubbleRef.current,
      tippyOptions: {
        placement: 'top',
        maxWidth: 420,
        interactive: true,
        appendTo: () => document.body,
        onHide: () => {
          // 只在没有润色结果和不在润色中时允许隐藏
          if (polishResult || polishing) return false
        },
      },
      shouldShow: ({ editor }) => {
        const { from, to } = editor.state.selection
        return from !== to
      },
    })
    editor.registerPlugin(plugin)
    return () => { editor.unregisterPlugin('aiPolishBubble') }
  }, [editor, polishing, polishResult])

  useEffect(() => {
    if (editor && value && !editor.isFocused) {
      const currentHtml = editor.getHTML()
      if (currentHtml !== value) {
        editor.commands.setContent(value)
      }
    }
  }, [editor, value])

  const setLink = useCallback(() => {
    if (!editor) return
    const prev = editor.getAttributes('link').href
    const url = window.prompt('输入链接地址', prev || 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    }
  }, [editor])

  const handlePolishStart = useCallback(async (type: PolishType) => {
    if (!editor) return
    const { from, to } = editor.state.selection
    if (from === to) return
    const selectedText = editor.state.doc.textBetween(from, to, ' ')
    lastPolishTypeRef.current = type
    setPolishing(true)
    setPolishResult(null)
    try {
      const res = await window.electronAPI.polishText({ text: selectedText, type })
      if (res.error) {
        message.error(res.error)
      } else {
        setPolishResult({ original: selectedText, result: res.result, type, from, to })
      }
    } catch {
      message.error('润色失败')
    } finally {
      setPolishing(false)
    }
  }, [editor, message])

  const handlePolishAccept = useCallback(() => {
    if (!editor || !polishResult) return
    editor.chain().focus().setTextSelection({ from: polishResult.from, to: polishResult.to }).deleteSelection().insertContent(polishResult.result).run()
    setPolishResult(null)
  }, [editor, polishResult])

  const handlePolishReject = useCallback(() => {
    setPolishResult(null)
  }, [])

  const handlePolishRetry = useCallback(() => {
    handlePolishStart(lastPolishTypeRef.current)
  }, [handlePolishStart])

  if (!editor) return null

  const ToolBtn = ({ icon, action, isActive, title }: { icon: React.ReactNode; action: () => void; isActive?: boolean; title: string }) => (
    <Tooltip title={title}>
      <Button type={isActive ? 'primary' : 'text'} size="small" icon={icon} onClick={action} style={{ minWidth: 32 }} />
    </Tooltip>
  )

  const Sep = () => <span style={{ width: 1, height: 20, background: '#d9d9d9', margin: '0 4px', display: 'inline-block' }} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #d9d9d9' }}>
        <Space size={2} wrap>
          <ToolBtn title="撤销" icon={<UndoOutlined />} action={() => editor.chain().focus().undo().run()} />
          <ToolBtn title="重做" icon={<RedoOutlined />} action={() => editor.chain().focus().redo().run()} />
          <Sep />
          {([1,2,3,4,5,6] as const).map(level => (
            <ToolBtn key={level} title={`标题 ${level}`} icon={<span style={{ fontWeight: 700, fontSize: Math.max(11, 15 - level) }}>H{level}</span>} action={() => editor.chain().focus().toggleHeading({ level }).run()} isActive={editor.isActive('heading', { level })} />
          ))}
          <ToolBtn title="正文" icon={<span style={{ fontSize: 13 }}>T</span>} action={() => editor.chain().focus().setParagraph().run()} isActive={editor.isActive('paragraph')} />
          <Sep />
          <ToolBtn title="粗体" icon={<BoldOutlined />} action={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} />
          <ToolBtn title="斜体" icon={<ItalicOutlined />} action={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} />
          <ToolBtn title="下划线" icon={<UnderlineOutlined />} action={() => editor.chain().focus().toggleUnderline().run()} isActive={editor.isActive('underline')} />
          <ToolBtn title="删除线" icon={<StrikethroughOutlined />} action={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} />
          <Sep />
          <ToolBtn title="引用" icon={<span style={{ fontWeight: 700, fontSize: 16, lineHeight: 1 }}>"</span>} action={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive('blockquote')} />
          <ToolBtn title="无序列表" icon={<UnorderedListOutlined />} action={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} />
          <ToolBtn title="有序列表" icon={<OrderedListOutlined />} action={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} />
          <ToolBtn title="分割线" icon={<MinusOutlined />} action={() => editor.chain().focus().setHorizontalRule().run()} />
          <Sep />
          <ToolBtn title="链接" icon={<LinkOutlined />} action={setLink} isActive={editor.isActive('link')} />
        </Space>
        {extraActions && <div>{extraActions}</div>}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <EditorContent editor={editor} />
      </div>

      {/* BubbleMenu 浮动面板 */}
      <div ref={bubbleRef} style={{ visibility: 'visible' }}>
        {polishResult ? (
          <Card size="small" style={{ width: 380, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>原文</div>
              <div style={{ fontSize: 13, color: '#999', textDecoration: 'line-through', lineHeight: 1.6 }}>
                {polishResult.original.length > 120 ? polishResult.original.slice(0, 120) + '...' : polishResult.original}
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: '#1677ff', marginBottom: 4 }}>润色结果</div>
              <div style={{ fontSize: 13, lineHeight: 1.6, background: '#f0f5ff', padding: '6px 8px', borderRadius: 4 }}>
                {polishResult.result.length > 200 ? polishResult.result.slice(0, 200) + '...' : polishResult.result}
              </div>
            </div>
            <Space>
              <Button size="small" type="primary" icon={<CheckOutlined />} onClick={handlePolishAccept}>采用</Button>
              <Button size="small" icon={<CloseOutlined />} onClick={handlePolishReject}>放弃</Button>
              <Button size="small" icon={<ReloadOutlined />} onClick={handlePolishRetry}>重试</Button>
            </Space>
          </Card>
        ) : polishing ? (
          <Card size="small" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
            <Space><LoadingOutlined /><span style={{ fontSize: 13 }}>正在润色...</span></Space>
          </Card>
        ) : (
          <div style={{ background: '#fff', padding: '4px 6px', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'flex', gap: 2 }}>
            <Button size="small" type="text" icon={<HighlightOutlined />} onClick={() => handlePolishStart('polish')}>润色</Button>
            <Button size="small" type="text" icon={<SwapOutlined />} onClick={() => handlePolishStart('rewrite')}>改写</Button>
            <Button size="small" type="text" icon={<ExpandOutlined />} onClick={() => handlePolishStart('expand')}>扩写</Button>
          </div>
        )}
      </div>

      <style>{`
        .tiptap { outline: none; min-height: 100%; padding: 8px 0; line-height: 1.7; font-size: 14px; }
        .tiptap h1 { font-size: 24px; font-weight: 600; margin: 20px 0 10px; }
        .tiptap h2 { font-size: 20px; font-weight: 600; margin: 16px 0 8px; }
        .tiptap h3 { font-size: 18px; font-weight: 600; margin: 12px 0 6px; }
        .tiptap h4 { font-size: 16px; font-weight: 600; margin: 12px 0 6px; }
        .tiptap h5 { font-size: 15px; font-weight: 600; margin: 10px 0 4px; }
        .tiptap h6 { font-size: 14px; font-weight: 600; margin: 10px 0 4px; }
        .tiptap p { margin-bottom: 8px; }
        .tiptap ul, .tiptap ol { padding-left: 24px; margin-bottom: 8px; }
        .tiptap li { margin-bottom: 4px; }
        .tiptap hr { border: none; border-top: 1px solid #e8e8e8; margin: 16px 0; }
        .tiptap code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-size: 13px; }
        .tiptap pre { background: #f5f5f5; padding: 12px; border-radius: 6px; overflow-x: auto; }
        .tiptap blockquote { border-left: 3px solid #d9d9d9; padding-left: 12px; color: #666; margin: 8px 0; }
        .tiptap a { color: #1677ff; text-decoration: underline; cursor: pointer; }
        .tiptap .is-editor-empty:first-child::before {
          content: attr(data-placeholder); float: left; color: #adb5bd; pointer-events: none; height: 0;
        }
      `}</style>
    </div>
  )
}
