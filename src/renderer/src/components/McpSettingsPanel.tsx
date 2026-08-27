import { useEffect, useState } from 'react'
import { Badge, Button, Input, Modal, Space, Switch, Tooltip, Typography, message } from 'antd'
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons'

const { Text } = Typography

interface McpStatus {
  state: 'stopped' | 'starting' | 'running' | 'error'
  enabled: boolean
  lastError?: string
}

const STATE_LABELS = {
  stopped: { text: '未启用', status: 'default' },
  starting: { text: '启动中', status: 'processing' },
  running: { text: '运行中', status: 'success' },
  error: { text: '启动失败', status: 'error' },
} as const

export function McpSettingsPanel() {
  const [status, setStatus] = useState<McpStatus | null>(null)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)

  const loadUrl = async (running: boolean) => {
    if (!running) {
      setUrl('')
      return
    }
    const result = await window.electronAPI.getMcpConnection()
    setUrl(result.url || '')
  }

  useEffect(() => {
    void window.electronAPI.getMcpStatus().then(async (result: { status: McpStatus }) => {
      setStatus(result.status)
      await loadUrl(result.status.state === 'running')
    })
  }, [])

  const configure = async (enabled: boolean) => {
    setBusy(true)
    try {
      const result = await window.electronAPI.configureMcp({ enabled })
      setStatus(result.status)
      await loadUrl(result.status.state === 'running')
      if (result.error || result.status.state === 'error') {
        message.error(result.error || result.status.lastError || 'MCP 服务启动失败')
      } else {
        message.success(enabled ? 'MCP 服务已开启' : 'MCP 服务已关闭')
      }
    } finally {
      setBusy(false)
    }
  }

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url)
      message.success('MCP 地址已复制')
    } catch (error) {
      message.error(error instanceof Error ? `复制失败：${error.message}` : '复制失败')
    }
  }

  const refreshUrl = () => {
    Modal.confirm({
      title: '刷新 MCP 地址？',
      content: '刷新后旧地址立即失效，已经接入的 Agent 需要重新配置。',
      okText: '确认刷新',
      cancelText: '取消',
      onOk: async () => {
        const result = await window.electronAPI.refreshMcpConnection()
        if (!result.url) {
          message.error(result.error || '刷新地址失败')
          return
        }
        setUrl(result.url)
        message.success('MCP 地址已刷新')
      },
    })
  }

  if (!status) return <Text type="secondary">正在读取 MCP 状态…</Text>
  const state = STATE_LABELS[status.state]
  const running = status.state === 'running'

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 18, borderBottom: '1px solid rgba(5, 5, 5, 0.08)' }}>
        <div>
          <Space size={10}>
            <Text strong style={{ fontSize: 15 }}>本地 MCP 服务</Text>
            <Badge status={state.status} text={state.text} />
          </Space>
          <div style={{ marginTop: 5 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>仅本机 Agent 可访问，iRecord 退出后服务停止</Text>
          </div>
        </div>
        <Switch checked={status.enabled} loading={busy || status.state === 'starting'} onChange={enabled => void configure(enabled)} />
      </div>

      <div style={{ paddingTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text strong>连接地址</Text>
          <Button type="text" size="small" icon={<ReloadOutlined />} disabled={!running} onClick={refreshUrl}>
            刷新地址
          </Button>
        </div>

        <Input
          size="large"
          value={url}
          readOnly
          placeholder="开启服务后生成 MCP 地址"
          style={{ marginTop: 10, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}
          suffix={(
            <Tooltip title="复制地址">
              <Button
                type="text"
                size="small"
                aria-label="复制 MCP 地址"
                icon={<CopyOutlined />}
                disabled={!url}
                onClick={() => void copyUrl()}
              />
            </Tooltip>
          )}
        />

        <Text type="secondary" style={{ display: 'block', fontSize: 12, marginTop: 8 }}>
          地址包含访问 token。除非主动刷新，否则启停或重启应用后地址保持不变。
        </Text>
      </div>

      {status.lastError && (
        <Text type="danger" style={{ display: 'block', fontSize: 12, marginTop: 16 }}>
          {status.lastError}
        </Text>
      )}
    </div>
  )
}
