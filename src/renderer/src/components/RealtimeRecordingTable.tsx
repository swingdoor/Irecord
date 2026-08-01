import { useCallback } from 'react'
import { Table, Button, Dropdown, message, Modal, Empty, Card, Row, Col, Typography } from 'antd'
import { EllipsisOutlined, DownloadOutlined, DeleteOutlined, FileTextOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { RealtimeRecording } from '../stores/appStore'

const { confirm } = Modal
const { Text } = Typography

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
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

interface RealtimeRecordingTableProps {
  recordings: RealtimeRecording[]
  viewMode: 'table' | 'card'
  selectedRowKeys: string[]
  onSelectedRowKeysChange: (keys: string[]) => void
  onView: (recording: RealtimeRecording) => void
  onTranscribe: (recording: RealtimeRecording) => void
  onDelete: (id: string) => void
}

export function RealtimeRecordingTable({
  recordings, viewMode, selectedRowKeys, onSelectedRowKeysChange, onView, onTranscribe, onDelete
}: RealtimeRecordingTableProps) {
  const handleExportWav = useCallback(async (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation()
    const result = await window.electronAPI.exportRealtimeRecordingWav(filePath)
    if (result.error) message.error(result.error)
    else if (!result.canceled) message.success('导出成功')
  }, [])

  const handleDelete = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    confirm({
      title: '确定删除此录音记录？',
      content: '删除后无法恢复',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: () => onDelete(id),
    })
  }, [onDelete])

  const getMenuItems = (): MenuProps['items'] => [
    { key: 'wav', icon: <DownloadOutlined />, label: '下载 WAV' },
    { key: 'transcribe', icon: <FileTextOutlined />, label: '文件转写分析' },
    { type: 'divider' },
    { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true },
  ]

  const handleMenuClick = (recording: RealtimeRecording, key: string, e: any) => {
    e.domEvent.stopPropagation()
    if (key === 'wav') handleExportWav(e.domEvent, recording.filePath)
    else if (key === 'transcribe') onTranscribe(recording)
    else if (key === 'delete') handleDelete(e.domEvent, recording.id)
  }

  const columns = [
    { title: '文件名称', dataIndex: 'title', key: 'title', width: '42%', ellipsis: true },
    { title: '时长', key: 'duration', width: '12%', render: (_: unknown, recording: RealtimeRecording) => formatDuration(recording.duration) },
    { title: '大小', key: 'fileSize', width: '12%', render: (_: unknown, recording: RealtimeRecording) => formatSize(recording.fileSize) },
    { title: '日期', key: 'createdAt', width: '25%', render: (_: unknown, recording: RealtimeRecording) => formatDate(recording.createdAt) },
    {
      title: '操作',
      key: 'actions',
      width: '9%',
      render: (_: unknown, recording: RealtimeRecording) => (
        <Dropdown
          menu={{ items: getMenuItems(), onClick: ({ key, domEvent }) => handleMenuClick(recording, key, { domEvent }) }}
          trigger={['click']}
        >
          <Button type="text" size="small" icon={<EllipsisOutlined />} onClick={(e) => e.stopPropagation()} />
        </Dropdown>
      ),
    },
  ]

  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      {recordings.length === 0 ? (
        <Empty description="暂无录音记录" style={{ padding: '48px 0' }} />
      ) : viewMode === 'table' ? (
        <Table
          columns={columns}
          dataSource={recordings}
          rowKey="id"
          size="small"
          sticky
          pagination={false}
          rowSelection={{ selectedRowKeys, onChange: (keys) => onSelectedRowKeysChange(keys as string[]) }}
          onRow={(recording) => ({ onClick: () => onView(recording), style: { cursor: 'pointer' } })}
        />
      ) : (
        <Row gutter={[16, 16]}>
          {recordings.map((recording) => (
            <Col span={8} key={recording.id}>
              <Card hoverable onClick={() => onView(recording)} styles={{ body: { padding: '10px 14px' } }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <Text strong ellipsis style={{ fontSize: 14, flex: 1, minWidth: 0 }}>{recording.title}</Text>
                  <Dropdown
                    menu={{ items: getMenuItems(), onClick: ({ key, domEvent }) => handleMenuClick(recording, key, { domEvent }) }}
                    trigger={['click']}
                  >
                    <Button type="text" size="small" icon={<EllipsisOutlined />} onClick={(e) => e.stopPropagation()} />
                  </Dropdown>
                </div>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>{formatShortDate(recording.createdAt)}</Text>
                <Row gutter={8}>
                  <Col span={12}><Text type="secondary">时长 </Text>{formatDuration(recording.duration)}</Col>
                  <Col span={12}><Text type="secondary">大小 </Text>{formatSize(recording.fileSize)}</Col>
                </Row>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  )
}
