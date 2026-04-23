import { useState, useCallback } from 'react'
import { Button, Checkbox, Typography, message, Space } from 'antd'
import { SaveOutlined, DeleteOutlined } from '@ant-design/icons'

const { Text } = Typography

interface RecordingSaveDialogProps {
  title: string
  duration: number
  wordCount: number
  filePath: string
  text: string
  segments: Array<{ text: string; startTime: number; endTime: number }>
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function RecordingSaveDialog({ title, duration, wordCount, filePath, text, segments }: RecordingSaveDialogProps) {
  const [enableProofreading, setEnableProofreading] = useState(true)
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const result = await window.electronAPI.saveRealtimeRecording({
        title,
        filePath,
        fileSize: 0,
        duration,
        wordCount,
        text,
        segments: segments.map(s => ({ text: s.text, start: s.startTime, end: s.endTime })),
        createProofreadingTask: enableProofreading
      })

      if (result.error) {
        message.error(result.error)
        setSaving(false)
        return
      }

      message.success('录音已保存')
      setTimeout(() => {
        window.electronAPI.closeFloatingRecorder()
      }, 500)
    } catch (err: any) {
      message.error(err.message || '保存失败')
      setSaving(false)
    }
  }, [title, filePath, duration, wordCount, text, segments, enableProofreading])

  const handleDiscard = useCallback(() => {
    window.electronAPI.closeFloatingRecorder()
  }, [])

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      WebkitAppRegion: 'drag',
      cursor: 'move'
    } as any}>
      {/* 顶部标题 */}
      <div style={{
        height: 40,
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        borderBottom: '1px solid #e8e8e8'
      }}>
        <Text strong style={{ fontSize: 14 }}>录音已完成</Text>
      </div>

      {/* 中间信息 */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24
      }}>
        <Text type="secondary" style={{ fontSize: 18, fontWeight: 500 }}>{formatDuration(duration)}</Text>
        <Text type="secondary" style={{ fontSize: 18, fontWeight: 500 }}>{wordCount}字</Text>
      </div>

      {/* 底部操作区 */}
      <div style={{
        height: 56,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        padding: '0 20px 6px'
      }}>
        <Checkbox
          checked={enableProofreading}
          onChange={(e) => setEnableProofreading(e.target.checked)}
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <Text style={{ fontSize: 13 }}>创建精校任务</Text>
        </Checkbox>

        <Space size={10} style={{ WebkitAppRegion: 'no-drag' } as any}>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saving}
          >
            保存
          </Button>
          <Button
            danger
            icon={<DeleteOutlined />}
            onClick={handleDiscard}
            disabled={saving}
          >
            丢弃
          </Button>
        </Space>
      </div>
    </div>
  )
}
