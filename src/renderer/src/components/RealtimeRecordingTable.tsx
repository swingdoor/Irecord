import { useState, useCallback } from 'react'
import { Table, Button, Dropdown, message, Modal } from 'antd'
import { EllipsisOutlined, DownloadOutlined, DeleteOutlined, ExperimentOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { RealtimeRecording } from '../stores/appStore'

const { confirm } = Modal

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
      ellipsis: true,
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 120,
      render: (text: string) => formatShortDate(text),
    },
    {
      title: '时长',
      dataIndex: 'duration',
      key: 'duration',
      width: 80,
      render: (seconds: number) => formatDuration(seconds),
    },
    {
      title: '字数',
      dataIndex: 'wordCount',
      key: 'wordCount',
      width: 80,
      render: (count: number) => count?.toLocaleString() || '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 60,
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

  return (
    <Table
      columns={columns}
      dataSource={recordings}
      rowKey="id"
      loading={loading}
      pagination={{ pageSize: 20, showSizeChanger: false, showTotal: (total) => `共 ${total} 条` }}
      locale={{ emptyText: '暂无录音记录' }}
      onRow={(record) => ({
        style: { cursor: 'pointer' },
        onClick: () => onView(record)
      })}
    />
  )
}
