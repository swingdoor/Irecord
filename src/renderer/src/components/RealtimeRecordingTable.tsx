import { useState, useCallback } from 'react'
import { Table, Button, Dropdown, message, Modal, Input, Space, Segmented, Empty, Card, Row, Col, Typography } from 'antd'
import {
  EllipsisOutlined, DownloadOutlined, DeleteOutlined, ExperimentOutlined,
  SearchOutlined, UnorderedListOutlined, AppstoreOutlined,
} from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { RealtimeRecording } from '../stores/appStore'

const { confirm } = Modal
const { Text } = Typography

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface RealtimeRecordingTableProps {
  recordings: RealtimeRecording[]
  onView: (recording: RealtimeRecording) => void
  onDelete: (id: string) => void
  onRefresh: () => void
}

export function RealtimeRecordingTable({ recordings, onView, onDelete, onRefresh }: RealtimeRecordingTableProps) {
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table')

  const handleExportWav = useCallback(async (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation()
    const result = await window.electronAPI.exportRealtimeRecordingWav(filePath)
    if (result.error) {
      message.error(result.error)
    } else if (!result.canceled) {
      message.success('导出成功')
    }
  }, [])

  const handleExportTxt = useCallback(async (e: React.MouseEvent, recording: RealtimeRecording) => {
    e.stopPropagation()
    const segments = JSON.parse(recording.segments)
    const result = await window.electronAPI.exportRealtimeRecordingTxt({
      text: recording.text,
      includeTimestamps: true,
      segments
    })
    if (result.error) {
      message.error(result.error)
    } else if (!result.canceled) {
      message.success('导出成功')
    }
  }, [])

  const handleProofread = useCallback(async (e: React.MouseEvent, recordingId: string) => {
    e.stopPropagation()
    setLoading(true)
    const result = await window.electronAPI.createProofreadingTask(recordingId)
    setLoading(false)

    if (result.error) {
      message.error(result.error)
    } else {
      message.success('精准校对任务已创建')
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

  const getMenuItems = (recording: RealtimeRecording): MenuProps['items'] => [
    { key: 'wav', icon: <DownloadOutlined />, label: '下载 WAV' },
    { key: 'txt', icon: <DownloadOutlined />, label: '导出 TXT' },
    { key: 'proofread', icon: <ExperimentOutlined />, label: '精准校对' },
    { type: 'divider' },
    { key: 'delete', icon: <DeleteOutlined />, label: '删除', danger: true },
  ]

  const handleMenuClick = (recording: RealtimeRecording, key: string, e: any) => {
    switch (key) {
      case 'wav': handleExportWav(e.domEvent, recording.filePath); break
      case 'txt': handleExportTxt(e.domEvent, recording); break
      case 'proofread': handleProofread(e.domEvent, recording.id); break
      case 'delete': handleDelete(e.domEvent, recording.id); break
    }
  }

  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      width: '40%',
      ellipsis: true,
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: '20%',
      render: (text: string) => formatShortDate(text),
    },
    {
      title: '时长',
      dataIndex: 'duration',
      key: 'duration',
      width: '13%',
      render: (seconds: number) => formatDuration(seconds),
    },
    {
      title: '字数',
      dataIndex: 'wordCount',
      key: 'wordCount',
      width: '13%',
      render: (count: number) => count?.toLocaleString() || '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: '14%',
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

  const filtered = search
    ? recordings.filter(r => r.title.toLowerCase().includes(search.toLowerCase()))
    : recordings

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', marginBottom: 16 }}>
        <Space>
          <Input
            placeholder="搜索录音..."
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
      </div>

      {filtered.length === 0 ? (
        <Empty description={search ? '没有匹配的录音' : '暂无录音记录'} style={{ padding: '48px 0' }} />
      ) : viewMode === 'table' ? (
        <Table
          columns={columns}
          dataSource={filtered}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{ pageSize: 10, showSizeChanger: false, showTotal: (total) => `共 ${total} 条` }}
          locale={{ emptyText: search ? '没有匹配的录音' : '暂无录音记录' }}
          onRow={(record) => ({
            style: { cursor: 'pointer' },
            onClick: () => onView(record)
          })}
        />
      ) : (
        <Row gutter={[16, 16]}>
          {filtered.map(recording => (
            <Col span={8} key={recording.id}>
              <Card
                hoverable
                onClick={() => onView(recording)}
                styles={{ body: { padding: '16px 20px' } }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text strong ellipsis style={{ fontSize: 14, flex: 1, minWidth: 0 }}>{recording.title}</Text>
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
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>{formatShortDate(recording.createdAt)}</Text>
                <Row gutter={[8, 6]}>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>时长 </Text>
                    <Text style={{ fontSize: 13 }}>{formatDuration(recording.duration)}</Text>
                  </Col>
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>字数 </Text>
                    <Text style={{ fontSize: 13 }}>{recording.wordCount?.toLocaleString() || '-'}</Text>
                  </Col>
                </Row>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  )
}
