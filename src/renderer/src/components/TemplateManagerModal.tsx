import { useState, useEffect } from 'react'
import { Modal, Input, Button, Space, Typography, App, Empty } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useAppStore, KnowledgeTemplate } from '../stores/appStore'

const { Text } = Typography

interface TemplateManagerModalProps {
  open: boolean
  onClose: () => void
}

export function TemplateManagerModal({ open, onClose }: TemplateManagerModalProps) {
  const { modal, message } = App.useApp()
  const { templates, refreshTemplates } = useAppStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPrompt, setEditPrompt] = useState('')

  useEffect(() => {
    if (open) {
      refreshTemplates()
      setEditing(false)
      setCreating(false)
    }
  }, [open])

  // 默认选中第一个
  useEffect(() => {
    if (templates.length > 0 && !selectedId) {
      setSelectedId(templates[0].id)
    }
  }, [templates, selectedId])

  const selected = templates.find(t => t.id === selectedId) || null

  const handleSelect = (tpl: KnowledgeTemplate) => {
    setSelectedId(tpl.id)
    setEditing(false)
    setCreating(false)
  }

  const handleStartCreate = () => {
    setCreating(true)
    setEditing(false)
    setSelectedId(null)
    setEditName('')
    setEditPrompt('')
  }

  const handleStartEdit = () => {
    if (!selected) return
    setEditing(true)
    setCreating(false)
    setEditName(selected.name)
    setEditPrompt(selected.prompt)
  }

  const handleSaveCreate = async () => {
    if (!editName.trim() || !editPrompt.trim()) {
      message.warning('请填写模板名称和提示词')
      return
    }
    const res = await window.electronAPI.createTemplate({ name: editName.trim(), prompt: editPrompt.trim() })
    if (res.error) { message.error(res.error); return }
    message.success('模板已创建')
    setCreating(false)
    await refreshTemplates()
    // 选中新创建的模板
    if (res.template) setSelectedId(res.template.id)
  }

  const handleSaveEdit = async () => {
    if (!selected || !editName.trim() || !editPrompt.trim()) {
      message.warning('请填写模板名称和提示词')
      return
    }
    const res = await window.electronAPI.updateTemplate({ templateId: selected.id, name: editName.trim(), prompt: editPrompt.trim() })
    if (res.error) { message.error(res.error); return }
    message.success('模板已更新')
    setEditing(false)
    refreshTemplates()
  }

  const handleDelete = () => {
    if (!selected) return
    modal.confirm({
      title: '确定删除此模板？',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        const res = await window.electronAPI.deleteTemplate(selected.id)
        if (res.error) { message.error(res.error); return }
        message.success('模板已删除')
        setSelectedId(null)
        refreshTemplates()
      },
    })
  }

  const handleCancel = () => {
    setEditing(false)
    setCreating(false)
    if (templates.length > 0) setSelectedId(templates[0].id)
  }

  // 右侧：编辑/新建表单
  const renderEditForm = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>模板名称</Text>
        <Input
          value={editName}
          onChange={e => setEditName(e.target.value)}
          placeholder="输入模板名称"
          style={{ marginTop: 4 }}
        />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>提示词</Text>
        <Input.TextArea
          value={editPrompt}
          onChange={e => setEditPrompt(e.target.value)}
          placeholder="输入提示词内容，使用 {text} 表示待处理的文本"
          style={{ flex: 1, marginTop: 4, resize: 'none' }}
        />
      </div>
      <Space>
        <Button type="primary" onClick={creating ? handleSaveCreate : handleSaveEdit}>保存</Button>
        <Button onClick={handleCancel}>取消</Button>
      </Space>
    </div>
  )

  // 右侧：查看详情
  const renderDetail = () => {
    if (!selected) {
      return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}><Empty description="选择一个模板查看" /></div>
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <Text strong style={{ fontSize: 16 }}>{selected.name}</Text>
            {selected.builtin === 1 && <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>[预设]</Text>}
          </div>
          {selected.builtin === 0 && (
            <Space>
              <Button size="small" icon={<EditOutlined />} onClick={handleStartEdit}>编辑</Button>
              <Button size="small" danger icon={<DeleteOutlined />} onClick={handleDelete}>删除</Button>
            </Space>
          )}
        </div>
        <div style={{ flex: 1, overflow: 'auto', background: '#fafafa', borderRadius: 6, padding: 12 }}>
          <Text style={{ fontSize: 13, lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{selected.prompt}</Text>
        </div>
      </div>
    )
  }

  return (
    <Modal title="模板管理" open={open} onCancel={onClose} footer={null} width={800} destroyOnClose styles={{ body: { padding: 0 } }}>
      <div style={{ display: 'flex', height: 480 }}>
        {/* 左侧：模板列表 */}
        <div style={{ width: 200, borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {templates.map(tpl => (
              <div
                key={tpl.id}
                onClick={() => handleSelect(tpl)}
                style={{
                  padding: '10px 16px',
                  cursor: 'pointer',
                  background: !creating && selectedId === tpl.id ? '#e6f4ff' : 'transparent',
                  borderRight: !creating && selectedId === tpl.id ? '2px solid #1677ff' : '2px solid transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Text strong={!creating && selectedId === tpl.id} ellipsis style={{ fontSize: 13, flex: 1 }}>
                    {tpl.name}
                  </Text>
                  {tpl.builtin === 1 && <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>预设</Text>}
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: 8, borderTop: '1px solid #f0f0f0' }}>
            <Button type="dashed" block icon={<PlusOutlined />} onClick={handleStartCreate}>新建模板</Button>
          </div>
        </div>

        {/* 右侧：详情/编辑 */}
        <div style={{ flex: 1, padding: 20 }}>
          {editing || creating ? renderEditForm() : renderDetail()}
        </div>
      </div>
    </Modal>
  )
}
