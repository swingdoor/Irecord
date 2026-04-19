import { useState, useEffect } from 'react'
import { Modal, Tabs, Form, Select, Input, Typography, AutoComplete, Button, Space } from 'antd'
import { FolderOpenOutlined } from '@ant-design/icons'

const { Text } = Typography

interface SettingsModalProps {
  open: boolean
  onClose: () => void
  availableModels: Array<{ id: string; name: string; available: boolean }>
  onSettingsChange: (settings: Record<string, any>) => void
}

const strategyOptions = [
  { value: 'auto', label: '自动选择（推荐）' },
  { value: 'speaker-diarization', label: '说话人分离' },
  { value: 'vad', label: 'VAD 分段' },
  { value: 'plain', label: '整体识别' },
]

const llmModelOptions = [
  { value: 'qwen3-max', label: 'qwen3-max' },
  { value: 'qwen3.6-plus', label: 'qwen3.6-plus' },
  { value: 'qwen3.5-flash', label: 'qwen3.5-flash' },
]

export function SettingsModal({ open, onClose, availableModels, onSettingsChange }: SettingsModalProps) {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) {
      window.electronAPI.getSettings().then(settings => {
        form.setFieldsValue({
          defaultModel: settings.defaultModel || availableModels.find(m => m.available)?.id || 'qwen3-asr',
          defaultStrategy: settings.defaultStrategy || 'auto',
          modelDir: settings.modelDir || '',
          ffmpegDir: settings.ffmpegDir || '',
          llmProvider: settings.llmProvider || 'dashscope',
          llmModel: settings.llmModel || 'qwen3-max',
          llmApiKey: settings.llmApiKey || '',
        })
      })
    }
  }, [open, form, availableModels])

  const handleSelectFolder = async (field: string) => {
    const result = await window.electronAPI.selectFolder()
    if (!result.canceled && result.path) {
      form.setFieldValue(field, result.path)
    }
  }

  const handleOk = async () => {
    const values = form.getFieldsValue()
    setLoading(true)
    await window.electronAPI.saveSettings(values)
    setLoading(false)
    onSettingsChange(values)
    onClose()
  }

  const available = availableModels.filter(m => m.available)

  return (
    <Modal
      title="设置"
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={loading}
      okText="保存"
      cancelText="取消"
      width={520}
      destroyOnClose
    >
      <Tabs
        items={[
          {
            key: 'basic',
            label: '基础配置',
            children: (
              <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
                <Form.Item label="默认模型" name="defaultModel">
                  <Select options={available.map(m => ({ value: m.id, label: m.name }))} />
                </Form.Item>
                <Form.Item label="默认策略" name="defaultStrategy">
                  <Select options={strategyOptions} />
                </Form.Item>
                <Form.Item label="模型文件夹">
                  <Space.Compact style={{ width: '100%' }}>
                    <Form.Item name="modelDir" noStyle>
                      <Input placeholder="留空使用默认路径 (resources/models)" />
                    </Form.Item>
                    <Button icon={<FolderOpenOutlined />} onClick={() => handleSelectFolder('modelDir')} />
                  </Space.Compact>
                </Form.Item>
                <Form.Item label="FFmpeg 文件夹">
                  <Space.Compact style={{ width: '100%' }}>
                    <Form.Item name="ffmpegDir" noStyle>
                      <Input placeholder="留空使用默认路径 (resources/ffmpeg)" />
                    </Form.Item>
                    <Button icon={<FolderOpenOutlined />} onClick={() => handleSelectFolder('ffmpegDir')} />
                  </Space.Compact>
                </Form.Item>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  策略说明：「自动选择」会根据已下载的模型自动选择最佳策略；手动指定时，若对应模型未下载则自动降级。
                </Text>
              </Form>
            ),
          },
          {
            key: 'llm',
            label: 'LLM 配置',
            children: (
              <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
                <Form.Item label="模型厂商" name="llmProvider">
                  <Select
                    options={[{ value: 'dashscope', label: '阿里百炼（DashScope）' }]}
                  />
                </Form.Item>
                <Form.Item label="模型" name="llmModel">
                  <AutoComplete
                    options={llmModelOptions}
                    placeholder="选择或输入模型代码"
                    filterOption={(input, option) =>
                      (option?.value as string)?.toLowerCase().includes(input.toLowerCase())
                    }
                  />
                </Form.Item>
                <Form.Item label="API Key" name="llmApiKey">
                  <Input.Password placeholder="请输入 API Key" />
                </Form.Item>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  API Key 用于调用大模型生成全文摘要、会议纪要等分析内容。可在阿里云百炼平台获取。
                </Text>
              </Form>
            ),
          },
        ]}
      />
    </Modal>
  )
}
