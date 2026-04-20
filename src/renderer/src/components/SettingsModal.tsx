import { useState, useEffect } from 'react'
import { Modal, Tabs, Form, Select, Input, InputNumber, Typography, AutoComplete, Button, Space } from 'antd'
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
        const asrParams = settings.asrParams || {}
        form.setFieldsValue({
          defaultModel: settings.defaultModel || availableModels.find(m => m.available)?.id || 'qwen3-asr',
          defaultStrategy: settings.defaultStrategy || 'auto',
          modelDir: settings.modelDir || '',
          ffmpegDir: settings.ffmpegDir || '',
          llmProvider: settings.llmProvider || 'dashscope',
          llmModel: settings.llmModel || 'qwen3-max',
          llmApiKey: settings.llmApiKey || '',
          clusteringThreshold: asrParams.clusteringThreshold ?? 0.85,
          vadThreshold: asrParams.vadThreshold ?? 0.5,
          minSilenceDuration: asrParams.minSilenceDuration ?? 1.5,
          minSpeechDuration: asrParams.minSpeechDuration ?? 1.0,
          maxSegmentDuration: asrParams.maxSegmentDuration ?? 30,
          maxDurationSeconds: asrParams.maxDurationSeconds ?? 7200,
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
    const settings = {
      defaultModel: values.defaultModel,
      defaultStrategy: values.defaultStrategy,
      modelDir: values.modelDir,
      ffmpegDir: values.ffmpegDir,
      llmProvider: values.llmProvider,
      llmModel: values.llmModel,
      llmApiKey: values.llmApiKey,
      asrParams: {
        clusteringThreshold: values.clusteringThreshold,
        vadThreshold: values.vadThreshold,
        minSilenceDuration: values.minSilenceDuration,
        minSpeechDuration: values.minSpeechDuration,
        maxSegmentDuration: values.maxSegmentDuration,
        maxDurationSeconds: values.maxDurationSeconds,
      },
    }

    setLoading(true)
    await window.electronAPI.saveSettings(settings)
    setLoading(false)
    onSettingsChange(settings)
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
      width={600}
      destroyOnClose
      styles={{ body: { minHeight: 420 } }}
    >
      <Tabs
        items={[
          {
            key: 'basic',
            label: '基础配置',
            children: (
              <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
                <style>{`
                  .ant-form-item { margin-bottom: 16px; }
                `}</style>
                <Form.Item label="默认模型" name="defaultModel">
                  <Select options={available.map(m => ({ value: m.id, label: m.name }))} />
                </Form.Item>
                <Form.Item label="默认策略" name="defaultStrategy">
                  <Select options={strategyOptions} />
                </Form.Item>
                <Form.Item label="模型文件夹">
                  <Space.Compact style={{ width: '100%' }}>
                    <Form.Item name="modelDir" noStyle>
                      <Input placeholder="请选择模型文件夹路径（必填）" />
                    </Form.Item>
                    <Button icon={<FolderOpenOutlined />} onClick={() => handleSelectFolder('modelDir')} />
                  </Space.Compact>
                </Form.Item>
                <Form.Item label="FFmpeg 文件夹">
                  <Space.Compact style={{ width: '100%' }}>
                    <Form.Item name="ffmpegDir" noStyle>
                      <Input placeholder="请选择 FFmpeg 所在文件夹路径（必填）" />
                    </Form.Item>
                    <Button icon={<FolderOpenOutlined />} onClick={() => handleSelectFolder('ffmpegDir')} />
                  </Space.Compact>
                </Form.Item>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  提示：安装包不包含模型和 FFmpeg，请手动下载后在此配置路径。策略说明：「自动选择」会根据已下载的模型自动选择最佳策略；手动指定时，若对应模型未下载则自动降级。
                </Text>
              </Form>
            ),
          },
          {
            key: 'asr',
            label: '识别参数',
            children: (
              <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
                <style>{`
                  .ant-form-item { margin-bottom: 16px; }
                `}</style>
                <Form.Item
                  label={
                    <span>
                      说话人聚类阈值
                      <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                        控制说话人分离的敏感度，值越高识别出的说话人越少（默认 0.85）
                      </Text>
                    </span>
                  }
                  name="clusteringThreshold"
                >
                  <InputNumber min={0.1} max={1.0} step={0.05} style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item
                  label={
                    <span>
                      VAD 检测阈值
                      <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                        语音活动检测灵敏度，值越高越严格（默认 0.5）
                      </Text>
                    </span>
                  }
                  name="vadThreshold"
                >
                  <InputNumber min={0.1} max={1.0} step={0.05} style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item
                  label={
                    <span>
                      最短静音时长（秒）
                      <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                        多长的静音才触发分段，值越大分段越少（默认 1.5）
                      </Text>
                    </span>
                  }
                  name="minSilenceDuration"
                >
                  <InputNumber min={0.5} max={5.0} step={0.1} style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item
                  label={
                    <span>
                      最短语音时长（秒）
                      <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                        最短有效语音段长度，过短的片段会被过滤（默认 1.0）
                      </Text>
                    </span>
                  }
                  name="minSpeechDuration"
                >
                  <InputNumber min={0.5} max={5.0} step={0.1} style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item
                  label={
                    <span>
                      最长分段时长（秒）
                      <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                        超长语音段会被强制切分，避免单段过长（默认 30）
                      </Text>
                    </span>
                  }
                  name="maxSegmentDuration"
                >
                  <InputNumber min={10} max={120} step={5} style={{ width: '100%' }} />
                </Form.Item>

                <Form.Item
                  label={
                    <span>
                      最大文件时长（秒）
                      <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                        允许导入的最长音频时长，超出会被拒绝（默认 7200 = 2小时）
                      </Text>
                    </span>
                  }
                  name="maxDurationSeconds"
                >
                  <InputNumber min={600} max={14400} step={600} style={{ width: '100%' }} />
                </Form.Item>
              </Form>
            ),
          },
          {
            key: 'llm',
            label: 'LLM 配置',
            children: (
              <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
                <style>{`
                  .ant-form-item { margin-bottom: 16px; }
                `}</style>
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
