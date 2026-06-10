import { useState, useCallback, useMemo } from 'react'
import { Table, Button, Dropdown, message, Modal, Space, Empty, Card, Row, Col, Typography, Tag, Progress } from 'antd'
import {
  EllipsisOutlined, DownloadOutlined, DeleteOutlined, ExperimentOutlined, FileTextOutlined,
  LoadingOutlined,
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { RealtimeRecording, Task } from '../stores/appStore'

const { confirm } = Modal
const { Text } = Typography

type TranscriptionStatus = 'none' | 'pending' | 'processing' | 'completed' | 'failed' | 'stopped' | 'pending_analysis' | 'recording'

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

// 匹配 TaskTable 的 StatusTag（含 processing 进度显示）
function StatusTag({
  status,
  themeMode,
  progress
}: {
  status: TranscriptionStatus
  themeMode: 'default' | 'monochrome'
  progress?: { stage: string; percent: number }
}) {
  const stageTextMap: Record<string, string> = {
    initializing: '初始化',
    segmenting: '分段中',
    recognizing: '识别中',
    done: '完成',
  }
  const processingText = progress
    ? `${stageTextMap[progress.stage] || progress.stage} ${progress.percent}%`
    : '处理中'

  if (themeMode === 'default') {
    const colorMap: Record<string, string> = {
      processing: 'processing',
      pending: 'default',
      completed: 'success',
      failed: 'error',
      stopped: 'warning',
      pending_analysis: 'cyan',
      none: 'default',
    }
    const textMap: Record<string, string> = {
      processing: processingText,
      pending: '排队中',
      completed: '已完成',
      failed: '失败',
      stopped: '已取消',
      pending_analysis: '待分析',
      none: '未转写',
    }
    return (
      <Tag
        color={colorMap[status] || 'default'}
        icon={status === 'processing' ? <LoadingOutlined /> : undefined}
      >
        {textMap[status] || status}
      </Tag>
    )
  }

  // 黑白主题
  const map: Record<string, { color: string; text: string }> = {
    processing: { color: '#18181b', text: processingText },
    pending: { color: '#71717a', text: '排队中' },
    completed: { color: '#27272a', text: '已完成' },
    failed: { color: '#3f3f46', text: '失败' },
    stopped: { color: '#52525b', text: '已取消' },
    pending_analysis: { color: '#08979c', text: '待分析' },
    none: { color: '#71717a', text: '未转写' },
  }
  const { color, text } = map[status] || { color: '#71717a', text: status }
  return (
    <Tag
      icon={status === 'processing' ? <LoadingOutlined /> : undefined}
      style={{ backgroundColor: color, borderColor: color, color: '#fff' }}
    >
      {text}
    </Tag>
  )
}

interface RealtimeRecordingTableProps {
  recordings: RealtimeRecording[]
  tasks: Task[]
  themeMode: 'default' | 'monochrome'
  processingStartTime: number
  taskProgress: Record<string, { stage: string; percent: number }>
  viewMode: 'table' | 'card'
  selectedRowKeys: string[]
  onSelectedRowKeysChange: (keys: string[]) => void
  onView: (recording: RealtimeRecording) => void
  onViewTranscription: (taskId: string) => void
  onDelete: (id: string) => void
  onRefresh: () => void
}

export function RealtimeRecordingTable({
  recordings, tasks, themeMode, processingStartTime, taskProgress, viewMode, selectedRowKeys, onSelectedRowKeysChange,
  onView, onViewTranscription, onDelete, onRefresh
}: RealtimeRecordingTableProps) {
  const [loading, setLoading] = useState(false)

  // 由 tasks 派生每条录音的转写任务：sourceId → 最新一条 recording 来源 task
  const taskMap = useMemo(() => {
    const map = new Map<string, Task>()
    for (const t of tasks) {
      if (t.source !== 'recording' || !t.sourceId) continue
      const existing = map.get(t.sourceId)
      // tasks 已按 createdAt DESC 排序（getAllTasks），首次见到即最新
      if (!existing) map.set(t.sourceId, t)
    }
    return map
  }, [tasks])

  const getTask = useCallback((recordingId: string) => taskMap.get(recordingId), [taskMap])

  const handleExportWav = useCallback(async (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation()
    const result = await window.electronAPI.exportRealtimeRecordingWav(filePath)
    if (result.error) {
      message.error(result.error)
    } else if (!result.canceled) {
      message.success('导出成功')
    }
  }, [])

  const handleTranscribe = useCallback(async (e: React.MouseEvent, recordingId: string) => {
    e.stopPropagation()
    setLoading(true)
    const result = await window.electronAPI.createRecordingTranscription(recordingId)
    setLoading(false)

    if (result.error) {
      message.error(result.error)
    } else {
      message.success('语音转写任务已创建')
      onRefresh()
    }
  }, [onRefresh])

  const handleDelete = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    confirm({
      title: '确定删除此录音记录？',
      content: '删除后无法恢复',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => onDelete(id)
    })
  }, [onDelete])

  const getMenuItems = (recording: RealtimeRecording): MenuProps['items'] => {
    const task = getTask(recording.id)
    const status: TranscriptionStatus = task?.status as TranscriptionStatus || 'none'
    const items: MenuProps['items'] = [
      { key: 'wav', icon: <DownloadOutlined />, label: '下载 WAV' },
    ]
    // 仅未转写/失败显示「语音转写」
    if (status === 'none' || status === 'failed' || status === 'stopped') {
      items.push({ key: 'transcribe', icon: <ExperimentOutlined />, label: '语音转写' })
    }
    // 仅已完成显示「转写详情」
    if (status === 'completed' || status === 'pending_analysis') {
      items.push({ key: 'transcription', icon: <FileTextOutlined />, label: '转写详情' })
    }
    items.push({ type: 'divider' })
    items.push({ key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true })
    return items
  }

  const handleMenuClick = (recording: RealtimeRecording, key: string, e: any) => {
    const task = getTask(recording.id)
    switch (key) {
      case 'wav': handleExportWav(e.domEvent, recording.filePath); break
      case 'transcribe': handleTranscribe(e.domEvent, recording.id); break
      case 'transcription': if (task) onViewTranscription(task.id); break
      case 'delete': handleDelete(e.domEvent, recording.id); break
    }
  }

  // 点击行：已转写跳转写详情，否则进录音详情
  const handleRowClick = useCallback((recording: RealtimeRecording) => {
    const task = getTask(recording.id)
    const status: TranscriptionStatus = task?.status as TranscriptionStatus || 'none'
    if ((status === 'completed' || status === 'pending_analysis') && task) {
      onViewTranscription(task.id)
    } else {
      onView(recording)
    }
  }, [getTask, onView, onViewTranscription])

  const columns = [
    {
      title: '文件名称',
      key: 'title',
      width: '30%',
      ellipsis: true,
      render: (_: any, recording: RealtimeRecording) => {
        const task = getTask(recording.id)
        return (
          <div>
            <div>{recording.title}</div>
            {task?.status === 'failed' && task.error && (
              <Text type="danger" style={{ fontSize: 12 }}>{task.error}</Text>
            )}
          </div>
        )
      },
    },
    { title: '时长', key: 'duration', width: '8%', render: (_: any, r: RealtimeRecording) => formatDuration(r.duration) },
    {
      title: '字数',
      key: 'wordCount',
      width: '8%',
      render: (_: any, recording: RealtimeRecording) => {
        const task = getTask(recording.id)
        return task?.wordCount != null ? task.wordCount.toLocaleString() : '-'
      },
    },
    {
      title: '耗时',
      key: 'processingTime',
      width: '8%',
      render: (_: any, recording: RealtimeRecording) => {
        const task = getTask(recording.id)
        if (!task) return '-'
        if (task.status === 'processing') {
          const [elapsed, setElapsed] = useState(Math.floor((Date.now() - processingStartTime) / 1000))
          setTimeout(() => setElapsed(Math.floor((Date.now() - processingStartTime) / 1000)), 1000)
          return <Text type="secondary" style={{ fontSize: 12 }}>{formatDuration(elapsed)}</Text>
        }
        return task.processingTime != null ? formatDuration(task.processingTime) : '-'
      },
    },
    {
      title: '模型',
      key: 'modelType',
      width: '10%',
      render: (_: any, recording: RealtimeRecording) => {
        const task = getTask(recording.id)
        return getModelLabel(task?.modelType)
      },
    },
    { title: '日期', key: 'createdAt', width: '15%', render: (_: any, r: RealtimeRecording) => formatDate(r.createdAt) },
    {
      title: '状态',
      key: 'status',
      width: '12%',
      render: (_: any, recording: RealtimeRecording) => {
        const task = getTask(recording.id)
        const status: TranscriptionStatus = task?.status as TranscriptionStatus || 'none'
        return (
          <Space size={4}>
            <StatusTag status={status} themeMode={themeMode} progress={task ? taskProgress[task.id] : undefined} />
            {status === 'processing' && task && taskProgress[task.id] && (
              <Progress
                percent={taskProgress[task.id].percent}
                size="small"
                showInfo={false}
                strokeColor={themeMode === 'default' ? '#1677ff' : '#18181b'}
                style={{ width: 80, margin: 0 }}
              />
            )}
          </Space>
        )
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: '9%',
      render: (_: any, record: RealtimeRecording) => (
        <Dropdown
          menu={{
            items: getMenuItems(record),
            onClick: ({ key, domEvent }) => handleMenuClick(record, key, { domEvent })
          }}
          trigger={['click']}
        >
          <Button type="text" size="small" icon={<EllipsisOutlined />} onClick={(e) => e.stopPropagation()} />
        </Dropdown>
      ),
    },
  ]


  // Card status border color（匹配 TaskTable）
  const statusBorderColor: Record<string, string> = themeMode === 'default' ? {
    processing: '#1677ff',
    pending: '#d9d9d9',
    completed: '#52c41a',
    failed: '#ff4d4f',
    stopped: '#faad14',
    pending_analysis: '#13c2c2',
    none: '#d9d9d9',
  } : {
    processing: '#18181b',
    pending: '#71717a',
    completed: '#27272a',
    failed: '#3f3f46',
    stopped: '#52525b',
    pending_analysis: '#08979c',
    none: '#71717a',
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {recordings.length === 0 ? (
        <Empty description="暂无录音记录" style={{ padding: '48px 0' }} />
      ) : viewMode === 'table' ? (
        <Table
          columns={columns}
          dataSource={recordings}
          rowKey="id"
          loading={loading}
          size="small"
          sticky
          pagination={false}
          locale={{ emptyText: '暂无录音记录' }}
          rowSelection={{
            selectedRowKeys,
            onChange: (keys) => onSelectedRowKeysChange(keys as string[])
          }}
          onRow={(record) => {
            const task = getTask(record.id)
            const status: TranscriptionStatus = task?.status as TranscriptionStatus || 'none'
            const clickable = status === 'completed' || status === 'pending_analysis' || status === 'none'
            return {
              onClick: () => clickable && handleRowClick(record),
              style: clickable ? { cursor: 'pointer' } : undefined,
            }
          }}
        />
      ) : (
        <Row gutter={[16, 16]}>
          {recordings.map(recording => {
            const task = getTask(recording.id)
            const status: TranscriptionStatus = task?.status as TranscriptionStatus || 'none'
            const clickable = status === 'completed' || status === 'pending_analysis' || status === 'none'
            return (
              <Col span={8} key={recording.id}>
                <Card
                  hoverable={clickable}
                  onClick={() => clickable && handleRowClick(recording)}
                  style={{
                    border: `1px solid ${statusBorderColor[status] || '#d9d9d9'}`,
                  }}
                  styles={{ body: { padding: '10px 14px' } }}
                >
                  {/* Header: title + status + menu */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text strong ellipsis style={{ fontSize: 14, flex: 1, minWidth: 0 }}>{recording.title}</Text>
                      <StatusTag status={status} themeMode={themeMode} progress={task ? taskProgress[task.id] : undefined} />
                      {status === 'processing' && task && taskProgress[task.id] && (
                        <Progress
                          percent={taskProgress[task.id].percent}
                          size="small"
                          showInfo={false}
                          strokeColor={themeMode === 'default' ? '#1677ff' : '#18181b'}
                          style={{ width: 60, margin: 0 }}
                        />
                      )}
                    </div>
                    <Dropdown
                      menu={{
                        items: getMenuItems(recording),
                        onClick: ({ key, domEvent }) => handleMenuClick(recording, key, { domEvent })
                      }}
                      trigger={['click']}
                    >
                      <Button type="text" size="small" icon={<EllipsisOutlined />} onClick={e => e.stopPropagation()} />
                    </Dropdown>
                  </div>

                  {/* Date */}
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>{formatShortDate(recording.createdAt)}</Text>

                  {/* Info: 2x2 grid */}
                  <Row gutter={[8, 6]}>
                    <Col span={12}>
                      <Text type="secondary" style={{ fontSize: 12 }}>时长 </Text>
                      <Text style={{ fontSize: 13 }}>{formatDuration(recording.duration)}</Text>
                    </Col>
                    <Col span={12}>
                      <Text type="secondary" style={{ fontSize: 12 }}>字数 </Text>
                      <Text style={{ fontSize: 13 }}>{task?.wordCount != null ? task.wordCount.toLocaleString() : '-'}</Text>
                    </Col>
                    <Col span={12}>
                      <Text type="secondary" style={{ fontSize: 12 }}>耗时 </Text>
                      <Text style={{ fontSize: 13 }}>
                        {task?.status === 'processing'
                          ? formatDuration(Math.floor((Date.now() - processingStartTime) / 1000))
                          : task?.processingTime != null ? formatDuration(task.processingTime) : '-'}
                      </Text>
                    </Col>
                    <Col span={12}>
                      <Text type="secondary" style={{ fontSize: 12 }}>模型 </Text>
                      <Text style={{ fontSize: 13 }}>{getModelLabel(task?.modelType)}</Text>
                    </Col>
                  </Row>

                  {task?.status === 'failed' && task.error && (
                    <Text type="danger" ellipsis style={{ fontSize: 12, marginTop: 6, display: 'block' }}>{task.error}</Text>
                  )}
                </Card>
              </Col>
            )
          })}
        </Row>
      )}
      </div>

      {themeMode === 'monochrome' && (
        <style>{`
          .ant-table-tbody > tr.ant-table-row-selected > td {
            background: #fafafa !important;
          }
          .ant-table-tbody > tr.ant-table-row-selected:hover > td {
            background: #f5f5f5 !important;
          }
        `}</style>
      )}
    </div>
  )
}
