import { useState, useEffect, useMemo } from 'react'
import { Modal, Select, App } from 'antd'
import { useAppStore } from '../stores/appStore'

interface CreateDocModalProps {
  open: boolean
  onClose: () => void
  onCreated: (docId: string) => void
}

export function CreateDocModal({ open, onClose, onCreated }: CreateDocModalProps) {
  const { message } = App.useApp()
  const { tasks, realtimeRecordings, templates, refreshTemplates } = useAppStore()
  const [templateId, setTemplateId] = useState<string>('')
  const [selectedSourceKeys, setSelectedSourceKeys] = useState<string[]>([])

  const completedTasks = tasks.filter(t => t.status === 'completed')

  useEffect(() => {
    if (open) {
      refreshTemplates()
      setTemplateId('')
      setSelectedSourceKeys([])
    }
  }, [open])

  // 构建下拉选项：realtime::id 或 task::id
  const sourceOptions = useMemo(() => {
    const opts: Array<{ label: string; value: string }> = []
    for (const rec of realtimeRecordings) {
      opts.push({
        label: `[录音] ${rec.title}（${rec.wordCount} 字）`,
        value: `realtime::${rec.id}`,
      })
    }
    for (const task of completedTasks) {
      opts.push({
        label: `[转写] ${task.fileName}（${task.wordCount || 0} 字）`,
        value: `task::${task.id}`,
      })
    }
    return opts
  }, [realtimeRecordings, completedTasks])

  const handleGenerate = async () => {
    if (!templateId) {
      message.warning('请选择模板')
      return
    }
    if (selectedSourceKeys.length === 0) {
      message.warning('请至少选择一条识别结果')
      return
    }

    const sourceIds = selectedSourceKeys.map(key => {
      const [type, id] = key.split('::')
      return { type: type as 'task' | 'realtime', id }
    })

    const res = await window.electronAPI.createKnowledgeDoc({ sourceIds, templateId })
    if (res.error) {
      message.error(res.error)
    } else if (res.docId) {
      message.success('文档生成中，请稍候...')
      onCreated(res.docId)
    }
  }

  return (
    <Modal
      title="新建知识文档"
      open={open}
      onCancel={onClose}
      width={520}
      okText="生成"
      cancelText="取消"
      onOk={handleGenerate}
      destroyOnClose
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0' }}>
        <div>
          <div style={{ marginBottom: 6, fontWeight: 500 }}>选择模板</div>
          <Select
            placeholder="请选择模板"
            value={templateId || undefined}
            onChange={setTemplateId}
            style={{ width: '100%' }}
            options={templates.map(t => ({
              value: t.id,
              label: t.builtin ? `${t.name} [预设]` : t.name,
            }))}
          />
        </div>

        <div>
          <div style={{ marginBottom: 6, fontWeight: 500 }}>选择识别结果</div>
          <Select
            mode="multiple"
            placeholder="请选择录音或转写记录"
            value={selectedSourceKeys}
            onChange={setSelectedSourceKeys}
            style={{ width: '100%' }}
            options={sourceOptions}
            maxTagCount="responsive"
            optionFilterProp="label"
          />
        </div>
      </div>
    </Modal>
  )
}
