import { useState, useEffect, useCallback } from 'react'
import { Table, Input, Typography, Space, Tag, Button, Dropdown, Empty, Card, Row, Col, Segmented, Modal, Progress, message } from 'antd'
import {
  SearchOutlined, EllipsisOutlined, LoadingOutlined, PlayCircleOutlined,
  CloseOutlined, DownloadOutlined, DeleteOutlined,
  UnorderedListOutlined, AppstoreOutlined, AudioOutlined, ExperimentOutlined,
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { Task } from '../stores/appStore'

const { Text } = Typography

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getModelLabel(modelType?: string): string {
  switch (modelType) {
    case 'qwen3-asr': return 'Qwen3-ASR'
    case 'sensevoice-small': return 'SenseVoice'
    default: return modelType || '-'
  }
}

function ProcessingTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [startTime])
  return <Text type="secondary" style={{ fontSize: 12 }}>{formatDuration(elapsed)}</Text>
}

const stageTextMap: Record<string, string> = {
  initializing: '初始化',
  segmenting: '分段中',
  recognizing: '识别中',
  done: '完成',
}

function StatusTag({ status, themeMode, progress }: { status: string; themeMode: 'default' | 'monochrome'; progress?: { stage: string; percent: number } }) {
  // 当 processing 且有进度时，用 stage + percent 替代"处理中"
  const processingText = progress
    ? `${stageTextMap[progress.stage] || progress.stage} ${progress.percent}%`
    : '处理中'

  if (themeMode === 'default') {
    // 默认主题：使用彩色
    const colorMap: Record<string, string> = {
      processing: 'processing',
      pending: 'default',
      completed: 'success',
      failed: 'error',
      stopped: 'warning',
      pending_analysis: 'cyan',
      recording: 'error',
    }
    const textMap: Record<string, string> = {
      processing: processingText,
      pending: '排队中',
      completed: '已完成',
      failed: '失败',
      stopped: '已取消',
      pending_analysis: '待分析',
      recording: '录音中',
    }
    return (
      <Tag
        color={colorMap[status] || 'default'}
        icon={status === 'processing' || status === 'recording' ? <LoadingOutlined /> : undefined}
      >
        {textMap[status] || status}
      </Tag>
    )
  }

  // 黑白主题：使用黑白灰 + 白色文字
  const map: Record<string, { color: string; text: string }> = {
    processing: { color: '#18181b', text: processingText },
    pending: { color: '#71717a', text: '排队中' },
    completed: { color: '#27272a', text: '已完成' },
    failed: { color: '#3f3f46', text: '失败' },
    stopped: { color: '#52525b', text: '已取消' },
    pending_analysis: { color: '#08979c', text: '待分析' },
    recording: { color: '#ff4d4f', text: '录音中' },
  }
  const { color, text } = map[status] || { color: '#71717a', text: status }
  return (
    <Tag
      icon={status === 'processing' || status === 'recording' ? <LoadingOutlined /> : undefined}
      style={{ backgroundColor: color, borderColor: color, color: '#fff' }}
    >
      {text}
    </Tag>
  )
}


interface TaskTableProps {
  tasks: Task[]
  processingStartTime: number
  taskProgress: Record<string, { stage: string; percent: number }>
  themeMode: 'default' | 'monochrome'
  onViewDetail: (task: Task) => void
  onDelete: (e: React.MouseEvent, id: string) => void
  onRestart: (e: React.MouseEvent, id: string) => void
  onCancel: (e: React.MouseEvent, id: string) => void
  onExportAudio?: (e: React.MouseEvent, filePath: string) => void
  onDeepAnalysis?: (e: React.MouseEvent, taskId: string) => void
}

export function TaskTable({ tasks, processingStartTime, taskProgress, themeMode, onViewDetail, onDelete, onRestart, onCancel, onExportAudio, onDeepAnalysis }: TaskTableProps) {
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table')
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const handleExport = useCallback(async (taskId: string) => {
    const data = await window.electronAPI.getTaskResult(taskId)
    if (data.error || !data.result) return
    const r = data.result
    await window.electronAPI.exportTxt({
      text: r.text,
      includeTimestamps: !!(r.segments && r.segments.length > 0),
      segments: r.segments,
      keywords: r.keywords,
      fileName: data.task?.fileName,
      label: '转写',
    })
  }, [])

  const handleBatchDelete = useCallback(() => {
    if (selectedRowKeys.length === 0) return

    const selectedTasks = tasks.filter(t => selectedRowKeys.includes(t.id))
    const processingTasks = selectedTasks.filter(t => t.status === 'processing')

    const title = processingTasks.length > 0
      ? `将取消 ${processingTasks.length} 个正在处理的任务，并删除所有 ${selectedRowKeys.length} 个任务`
      : `确定删除选中的 ${selectedRowKeys.length} 个任务？`

    Modal.confirm({
      title,
      content: '删除后无法恢复',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        setLoading(true)

        // 先取消 processing 任务
        for (const task of processingTasks) {
          await window.electronAPI.cancelTask(task.id)
        }

        // 再批量删除
        for (const id of selectedRowKeys) {
          await window.electronAPI.deleteTask(id)
        }

        setLoading(false)
        setSelectedRowKeys([])
        message.success(`已删除 ${selectedRowKeys.length} 个任务`)
        window.location.reload()
      }
    })
  }, [selectedRowKeys, tasks])

  const handleBatchExportTxt = useCallback(async () => {
    if (selectedRowKeys.length === 0) return

    const selectedTasks = tasks.filter(t => selectedRowKeys.includes(t.id))
    const exportableTasks = selectedTasks.filter(t => t.status === 'completed')

    if (exportableTasks.length === 0) {
      message.warning('选中的任务中没有已完成的任务')
      return
    }

    if (exportableTasks.length < selectedTasks.length) {
      message.info(`将导出 ${exportableTasks.length} 个文件（跳过 ${selectedTasks.length - exportableTasks.length} 个未完成的任务）`)
    }

    setLoading(true)
    const result = await window.electronAPI.batchExportTaskTxt(exportableTasks.map(t => t.id))
    setLoading(false)

    if (result.error) {
      message.error(result.error)
      return
    }

    if (result.canceled) return

    if (result.failed === 0) {
      message.success(`已导出 ${result.success} 个文件到 ${result.targetDir}`)
    } else {
      message.warning(`已导出 ${result.success} 个文件，${result.failed} 个失败`)
    }

    setSelectedRowKeys([])
  }, [selectedRowKeys, tasks])

  const filtered = search
    ? tasks.filter(t => t.fileName.toLowerCase().includes(search.toLowerCase()))
    : tasks

  const getMenuItems = (task: Task): MenuProps['items'] => {
    const items: MenuProps['items'] = []
    if (task.status === 'failed' || task.status === 'stopped') {
      items.push({ key: 'restart', icon: <PlayCircleOutlined />, label: '重新开始' })
    }
    if (task.status === 'pending' || task.status === 'processing') {
      items.push({ key: 'cancel', icon: <CloseOutlined />, label: '取消' })
    }
    if (task.status === 'completed') {
      items.push({ key: 'export', icon: <DownloadOutlined />, label: '导出 TXT' })
    }
    if (task.status === 'pending_analysis') {
      items.push({ key: 'deep-analysis', icon: <ExperimentOutlined />, label: '深度分析' })
      items.push({ key: 'export-audio', icon: <AudioOutlined />, label: '导出音频' })
      items.push({ key: 'export', icon: <DownloadOutlined />, label: '导出日志' })
    }
    items.push({ type: 'divider' })
    items.push({ key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true })
    return items
  }

  const handleMenuClick = (task: Task, key: string, e: any) => {
    e.domEvent?.stopPropagation()
    switch (key) {
      case 'restart': onRestart(e.domEvent, task.id); break
      case 'cancel': onCancel(e.domEvent, task.id); break
      case 'export': handleExport(task.id); break
      case 'delete':
        Modal.confirm({
          title: '确定删除此任务？',
          content: '删除后无法恢复',
          okText: '删除',
          okType: 'danger',
          cancelText: '取消',
          onOk: () => onDelete(e.domEvent, task.id),
        })
        break
      case 'export-audio': onExportAudio?.(e.domEvent, task.filePath); break
      case 'deep-analysis': onDeepAnalysis?.(e.domEvent, task.id); break
    }
  }

  const columns = [
    {
      title: '文件名称',
      dataIndex: 'fileName',
      key: 'fileName',
      width: '25%',
      ellipsis: true,
      render: (_: string, task: Task) => (
        <div>
          <div>{task.fileName}</div>
          {task.status === 'failed' && task.error && (
            <Text type="danger" style={{ fontSize: 12 }}>{task.error}</Text>
          )}
        </div>
      ),
    },
    { title: '时长', dataIndex: 'duration', key: 'duration', width: '8%', render: (d: number) => formatDuration(d) },
    { title: '字数', dataIndex: 'wordCount', key: 'wordCount', width: '8%', render: (w: number | null) => w != null ? w.toLocaleString() : '-' },
    { title: '耗时', dataIndex: 'processingTime', key: 'processingTime', width: '8%', render: (t: number | null, record: Task) => record.status === 'processing' ? <ProcessingTimer startTime={processingStartTime} /> : t != null ? formatDuration(t) : '-' },
    { title: '模型', dataIndex: 'modelType', key: 'modelType', width: '12%', render: (m: string) => getModelLabel(m) },
    { title: '日期', dataIndex: 'createdAt', key: 'createdAt', width: '17%', render: (d: string) => formatDate(d) },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: '20%',
      render: (status: string, record: Task) => (
        <Space size={4}>
          <StatusTag status={status} themeMode={themeMode} progress={taskProgress[record.id]} />
          {status === 'processing' && taskProgress[record.id] && (
            <Progress
              percent={taskProgress[record.id].percent}
              size="small"
              showInfo={false}
              strokeColor={themeMode === 'default' ? '#1677ff' : '#18181b'}
              style={{ width: 80, margin: 0 }}
            />
          )}
        </Space>
      ),
    },
    {
      title: '操作', key: 'actions', width: '10%',
      render: (_: any, task: Task) => (
        <Dropdown menu={{ items: getMenuItems(task), onClick: (e) => handleMenuClick(task, e.key, e) }} trigger={['click']}>
          <Button type="text" size="small" icon={<EllipsisOutlined />} onClick={e => e.stopPropagation()} />
        </Dropdown>
      ),
    },
  ]

  // Card status border color
  const statusBorderColor: Record<string, string> = themeMode === 'default' ? {
    processing: '#1677ff',
    pending: '#d9d9d9',
    completed: '#52c41a',
    failed: '#ff4d4f',
    stopped: '#faad14',
    pending_analysis: '#13c2c2',
  } : {
    processing: '#18181b',
    pending: '#71717a',
    completed: '#27272a',
    failed: '#3f3f46',
    stopped: '#52525b',
    pending_analysis: '#08979c',
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space>
          <Input
            placeholder="搜索文件..."
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
        {selectedRowKeys.length > 0 && (
          <Space>
            <Button danger onClick={handleBatchDelete}>
              删除选中 ({selectedRowKeys.length})
            </Button>
            <Button onClick={handleBatchExportTxt}>
              批量导出 TXT
            </Button>
          </Space>
        )}
      </div>

      {filtered.length === 0 ? (
        <Empty description={search ? '没有匹配的文件' : '暂无任务，上传音视频文件开始'} style={{ padding: '48px 0' }} />
      ) : viewMode === 'table' ? (
        <Table
          dataSource={filtered}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `共 ${total} 条` }}
          locale={{ emptyText: search ? '没有匹配的文件' : '暂无任务，上传音视频文件开始' }}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => setSelectedRowKeys(keys as string[])
          }}
          onRow={(task) => ({
            onClick: () => (task.status === 'completed' || task.status === 'pending_analysis') && onViewDetail(task),
            style: (task.status === 'completed' || task.status === 'pending_analysis') ? { cursor: 'pointer' } : undefined,
          })}
        />
      ) : (
        <Row gutter={[16, 16]}>
          {filtered.map(task => (
            <Col span={8} key={task.id}>
              <Card
                hoverable={task.status === 'completed' || task.status === 'pending_analysis'}
                onClick={() => (task.status === 'completed' || task.status === 'pending_analysis') && onViewDetail(task)}
                style={{
                  border: `1px solid ${statusBorderColor[task.status] || '#d9d9d9'}`,
                }}
                styles={{ body: { padding: '16px 20px' } }}
              >
                {/* Header: title + status + menu */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Text strong ellipsis style={{ fontSize: 14, flex: 1, minWidth: 0 }}>{task.fileName}</Text>
                    <StatusTag status={task.status} themeMode={themeMode} progress={taskProgress[task.id]} />
                    {task.status === 'processing' && taskProgress[task.id] && (
                      <Progress
                        percent={taskProgress[task.id].percent}
                        size="small"
                        showInfo={false}
                        strokeColor={themeMode === 'default' ? '#1677ff' : '#18181b'}
                        style={{ width: 60, margin: 0 }}
                      />
                    )}
                  </div>
                  <Dropdown menu={{ items: getMenuItems(task), onClick: (e) => handleMenuClick(task, e.key, e) }} trigger={['click']}>
                    <Button type="text" size="small" icon={<EllipsisOutlined />} onClick={e => e.stopPropagation()} />
                  </Dropdown>
                </div>

                {/* Date */}
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>{formatShortDate(task.createdAt)}</Text>

                {/* Info: 2-column grid */}
                <Row gutter={[8, 6]}>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>时长 </Text>
                    <Text style={{ fontSize: 13 }}>{formatDuration(task.duration)}</Text>
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>字数 </Text>
                    <Text style={{ fontSize: 13 }}>{task.wordCount != null ? task.wordCount.toLocaleString() : '-'}</Text>
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>耗时 </Text>
                    {task.status === 'processing'
                      ? <ProcessingTimer startTime={processingStartTime} />
                      : <Text style={{ fontSize: 13 }}>{task.processingTime != null ? formatDuration(task.processingTime) : '-'}</Text>
                    }
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>模型 </Text>
                    <Text style={{ fontSize: 13 }}>{getModelLabel(task.modelType)}</Text>
                  </Col>
                </Row>

                {task.status === 'failed' && task.error && (
                  <Text type="danger" ellipsis style={{ fontSize: 12, marginTop: 6, display: 'block' }}>{task.error}</Text>
                )}
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  )
}
