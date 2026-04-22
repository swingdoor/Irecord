import { useState, useCallback } from 'react'
import { Table, Input, Space, Segmented, Button, Dropdown, Empty, Card, Row, Col, Typography, Tag, Tooltip, App } from 'antd'
import {
  SearchOutlined, UnorderedListOutlined, AppstoreOutlined, EllipsisOutlined,
  DownloadOutlined, DeleteOutlined, SettingOutlined, LoadingOutlined, CheckCircleOutlined, CloseCircleOutlined,
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { KnowledgeDoc, KnowledgeTemplate, useAppStore } from '../stores/appStore'
import { TemplateManagerModal } from './TemplateManagerModal'

const { Text } = Typography

function formatDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface KnowledgeTableProps {
  docs: KnowledgeDoc[]
  templates: KnowledgeTemplate[]
  themeMode?: 'default' | 'monochrome'
  onView: (doc: KnowledgeDoc) => void
  onDelete: (docId: string) => void
  onRefresh: () => void
  onCreateNew: () => void
}

export function KnowledgeTable({ docs, templates, themeMode = 'default', onView, onDelete, onRefresh, onCreateNew }: KnowledgeTableProps) {
  const { modal, message } = App.useApp()
  const { tasks, realtimeRecordings } = useAppStore()
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table')
  const [templateModalOpen, setTemplateModalOpen] = useState(false)

  const filtered = search
    ? docs.filter(d => d.title.toLowerCase().includes(search.toLowerCase()))
    : docs

  const getTemplateName = (templateId: string) => {
    const tpl = templates.find(t => t.id === templateId)
    return tpl?.name || '未知模板'
  }

  const getSourceInfo = (sourceIds: string) => {
    try {
      const sources = JSON.parse(sourceIds) as Array<{ type: 'task' | 'realtime'; id: string }>
      const details = sources.map(src => {
        if (src.type === 'task') {
          const task = tasks.find(t => t.id === src.id)
          return task ? { name: task.fileName, wordCount: task.wordCount || 0 } : { name: '已删除', wordCount: 0 }
        } else {
          const rec = realtimeRecordings.find(r => r.id === src.id)
          return rec ? { name: rec.title, wordCount: rec.wordCount } : { name: '已删除', wordCount: 0 }
        }
      })
      return { count: sources.length, details }
    } catch {
      return { count: 0, details: [] }
    }
  }

  const renderSourceTooltip = (sourceIds: string) => {
    const { count, details } = getSourceInfo(sourceIds)
    if (count === 0) return <Text type="secondary">无来源</Text>

    const content = (
      <div>
        {details.map((d, i) => (
          <div key={i} style={{ marginBottom: 4 }}>
            <Text style={{ color: '#fff' }}>{d.name}</Text>
            <Text type="secondary" style={{ marginLeft: 8, fontSize: 12, color: '#d9d9d9' }}>
              {d.wordCount} 字
            </Text>
          </div>
        ))}
      </div>
    )

    return (
      <Tooltip title={content} placement="topLeft">
        <Text style={{ cursor: 'default' }}>
          {count} 条
        </Text>
      </Tooltip>
    )
  }

  const renderStatus = (status: string) => {
    const isMonochrome = themeMode === 'monochrome'
    switch (status) {
      case 'generating':
        return <Tag icon={<LoadingOutlined spin />} color={isMonochrome ? undefined : 'processing'} style={isMonochrome ? { background: '#000', color: '#fff', border: '1px solid #000' } : undefined}>生成中</Tag>
      case 'completed':
        return <Tag icon={<CheckCircleOutlined />} color={isMonochrome ? undefined : 'success'} style={isMonochrome ? { background: '#000', color: '#fff', border: '1px solid #000' } : undefined}>已完成</Tag>
      case 'failed':
        return <Tag icon={<CloseCircleOutlined />} color={isMonochrome ? undefined : 'error'} style={isMonochrome ? { background: '#000', color: '#fff', border: '1px solid #000' } : undefined}>失败</Tag>
      default:
        return <Tag style={isMonochrome ? { background: '#000', color: '#fff', border: '1px solid #000' } : undefined}>{status}</Tag>
    }
  }

  const handleExportMarkdown = useCallback(async (e: React.MouseEvent, doc: KnowledgeDoc) => {
    e.stopPropagation()
    const res = await window.electronAPI.exportKnowledgeMarkdown({ title: doc.title, content: doc.content })
    if (res.error) message.error(res.error)
    else if (!res.canceled) message.success('导出成功')
  }, [message])

  const handleExportTxt = useCallback(async (e: React.MouseEvent, doc: KnowledgeDoc) => {
    e.stopPropagation()
    const res = await window.electronAPI.exportKnowledgeTxt({ title: doc.title, content: doc.content })
    if (res.error) message.error(res.error)
    else if (!res.canceled) message.success('导出成功')
  }, [message])

  const handleExportPdf = useCallback(async (e: React.MouseEvent, doc: KnowledgeDoc) => {
    e.stopPropagation()
    const res = await window.electronAPI.exportKnowledgePdf({ title: doc.title, content: doc.content })
    if (res.error) message.error(res.error)
    else if (!res.canceled) message.success('导出成功')
  }, [message])

  const handleDelete = useCallback((e: React.MouseEvent, docId: string) => {
    e.stopPropagation()
    modal.confirm({
      title: '确定删除此文档？',
      content: '删除后无法恢复',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => onDelete(docId),
    })
  }, [modal, onDelete])

  const getMenuItems = (doc: KnowledgeDoc): MenuProps['items'] => [
    { key: 'md', icon: <DownloadOutlined />, label: '导出 Markdown', disabled: doc.status !== 'completed' },
    { key: 'txt', icon: <DownloadOutlined />, label: '导出 TXT', disabled: doc.status !== 'completed' },
    { key: 'pdf', icon: <DownloadOutlined />, label: '导出 PDF', disabled: doc.status !== 'completed' },
    { type: 'divider' },
    { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true },
  ]

  const handleMenuClick = (doc: KnowledgeDoc, key: string, e: any) => {
    switch (key) {
      case 'md': handleExportMarkdown(e.domEvent, doc); break
      case 'txt': handleExportTxt(e.domEvent, doc); break
      case 'pdf': handleExportPdf(e.domEvent, doc); break
      case 'delete': handleDelete(e.domEvent, doc.id); break
    }
  }

  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      width: '30%',
      ellipsis: true,
    },
    {
      title: '来源',
      dataIndex: 'sourceIds',
      key: 'sourceIds',
      width: '12%',
      render: (sourceIds: string) => renderSourceTooltip(sourceIds),
    },
    {
      title: '模板',
      dataIndex: 'templateId',
      key: 'templateId',
      width: '13%',
      render: (templateId: string) => getTemplateName(templateId),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: '20%',
      render: (updatedAt: string) => formatDate(updatedAt),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: '10%',
      render: (status: string) => renderStatus(status),
    },
    {
      title: '操作',
      key: 'actions',
      width: '15%',
      render: (_: any, doc: KnowledgeDoc) => (
        <Dropdown
          menu={{
            items: getMenuItems(doc),
            onClick: ({ key, domEvent }) => handleMenuClick(doc, key, { domEvent })
          }}
          trigger={['click']}
        >
          <Button type="text" size="small" icon={<EllipsisOutlined />} onClick={(e) => e.stopPropagation()} />
        </Dropdown>
      ),
    },
  ]

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space>
          <Input
            placeholder="搜索文档..."
            prefix={<SearchOutlined />}
            value={search}
            onChange={e => setSearch(e.target.value)}
            allowClear
            style={{ width: 240 }}
          />
          <Segmented
            value={viewMode}
            onChange={v => setViewMode(v as 'table' | 'card')}
            options={[
              { value: 'table', icon: <UnorderedListOutlined /> },
              { value: 'card', icon: <AppstoreOutlined /> },
            ]}
          />
        </Space>
        <Button icon={<SettingOutlined />} onClick={() => setTemplateModalOpen(true)}>
          管理模板
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Empty description={search ? '没有匹配的文档' : '暂无文档，点击上方"新建文档"开始'} style={{ padding: '48px 0' }} />
      ) : viewMode === 'table' ? (
        <Table
          dataSource={filtered}
          columns={columns}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `共 ${total} 条` }}
          onRow={(doc) => ({
            onClick: () => doc.status === 'completed' && onView(doc),
            style: { cursor: doc.status === 'completed' ? 'pointer' : 'default' },
          })}
        />
      ) : (
        <Row gutter={[16, 16]}>
          {filtered.map(doc => {
            const { count, details } = getSourceInfo(doc.sourceIds)
            const sourceNames = details.map(d => d.name).join(' · ')

            return (
              <Col span={8} key={doc.id}>
                <Card
                  hoverable={doc.status === 'completed'}
                  onClick={() => doc.status === 'completed' && onView(doc)}
                  styles={{ body: { padding: '16px 20px' } }}
                >
                  {/* Header: title + status + menu */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text strong ellipsis style={{ fontSize: 14, flex: 1, minWidth: 0 }}>{doc.title}</Text>
                      {renderStatus(doc.status)}
                    </div>
                    <Dropdown
                      menu={{
                        items: getMenuItems(doc),
                        onClick: ({ key, domEvent }) => handleMenuClick(doc, key, { domEvent })
                      }}
                      trigger={['click']}
                    >
                      <Button type="text" size="small" icon={<EllipsisOutlined />} onClick={e => e.stopPropagation()} />
                    </Dropdown>
                  </div>

                  {/* Date */}
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>{formatDate(doc.updatedAt)}</Text>

                  {/* Info: 2-column grid */}
                  <Row gutter={[8, 6]}>
                    <Col span={12}>
                      <Text type="secondary" style={{ fontSize: 12 }}>模板 </Text>
                      <Text style={{ fontSize: 13 }}>{getTemplateName(doc.templateId)}</Text>
                    </Col>
                    <Col span={12}>
                      <Tooltip title={details.map(d => `${d.name}（${d.wordCount} 字）`).join('\n')}>
                        <Text type="secondary" style={{ fontSize: 12 }}>来源 </Text>
                        <Text style={{ fontSize: 13 }}>{count} 条</Text>
                      </Tooltip>
                    </Col>
                  </Row>

                  {doc.status === 'failed' && doc.error && (
                    <Text type="danger" ellipsis style={{ fontSize: 12, marginTop: 6, display: 'block' }}>{doc.error}</Text>
                  )}
                </Card>
              </Col>
            )
          })}
        </Row>
      )}

      <TemplateManagerModal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
      />
    </div>
  )
}
