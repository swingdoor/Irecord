import { useState, useEffect } from 'react'
import { Modal, Tabs, Form, Select, Input, InputNumber, Typography, AutoComplete, Button, Space, message } from 'antd'
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
  const [realtimeEngine, setRealtimeEngine] = useState('qwen3-simulated-streaming')

  useEffect(() => {
    if (open) {
      window.electronAPI.getSettings().then(settings => {
        const asrParams = settings.asrParams || {}
        const realtimeParams = settings.realtimeParams || {}
        const engineConfig = settings.realtimeEngineConfig || {}
        const zipformerParams = engineConfig.zipformerParams || realtimeParams
        const qwen3Params = engineConfig.qwen3Params || {}

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
          realtimeEngine: engineConfig.engine || 'qwen3-simulated-streaming',
          zipformerAudioGain: zipformerParams.audioGain ?? 2.0,
          rule1MinTrailingSilence: zipformerParams.rule1MinTrailingSilence ?? 2.4,
          rule2MinTrailingSilence: zipformerParams.rule2MinTrailingSilence ?? 1.2,
          rule3MinUtteranceLength: zipformerParams.rule3MinUtteranceLength ?? 20.0,
          qwen3AudioGain: qwen3Params.audioGain ?? 2.0,
          qwen3VadThreshold: qwen3Params.vadThreshold ?? 0.5,
          qwen3VadMinSilenceDuration: qwen3Params.vadMinSilenceDuration ?? 0.5,
          qwen3VadMaxSpeechDuration: qwen3Params.vadMaxSpeechDuration ?? 30.0,
          qwen3MaxSegmentDuration: qwen3Params.maxSegmentDuration ?? 30.0,
        })
        setRealtimeEngine(engineConfig.engine || 'qwen3-simulated-streaming')
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

    // 先读取现有设置，再合并（避免覆盖未渲染 Tab 的配置）
    const currentSettings = await window.electronAPI.getSettings()

    const settings = {
      ...currentSettings,
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
      realtimeEngineConfig: {
        engine: values.realtimeEngine,
        zipformerParams: {
          audioGain: values.zipformerAudioGain,
          rule1MinTrailingSilence: values.rule1MinTrailingSilence,
          rule2MinTrailingSilence: values.rule2MinTrailingSilence,
          rule3MinUtteranceLength: values.rule3MinUtteranceLength,
        },
        qwen3Params: {
          audioGain: values.qwen3AudioGain,
          vadThreshold: values.qwen3VadThreshold,
          vadMinSilenceDuration: values.qwen3VadMinSilenceDuration,
          vadMaxSpeechDuration: values.qwen3VadMaxSpeechDuration,
          maxSegmentDuration: values.qwen3MaxSegmentDuration,
        }
      }
    }

    setLoading(true)
    const result = await window.electronAPI.saveSettings(settings)
    setLoading(false)
    if (result?.error) {
      message.error(`保存失败: ${result.error}`)
    } else {
      message.success('设置已保存')
      onSettingsChange(settings)
    }
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
            label: '基础设置',
            children: (
              <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
                <style>{`
                  .ant-form-item { margin-bottom: 16px; }
                `}</style>
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
                  安装包不包含模型和 FFmpeg，请手动下载后在此配置路径。
                </Text>
              </Form>
            ),
          },
          {
            key: 'realtime',
            label: '实时录音',
            children: (
              <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
                <style>{`
                  .ant-form-item { margin-bottom: 16px; }
                `}</style>
                <Form.Item label="识别引擎" name="realtimeEngine">
                  <Select
                    onChange={(v) => setRealtimeEngine(v)}
                    options={[
                      { value: 'qwen3-simulated-streaming', label: 'Qwen3-ASR + VAD（推荐，准确率高）' },
                      { value: 'streaming-zipformer', label: 'Zipformer 流式（低延迟）' },
                    ]}
                  />
                </Form.Item>

                {realtimeEngine === 'qwen3-simulated-streaming' && (
                  <>
                    <Form.Item
                      label={<span>音频增益<Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>放大麦克风音量（默认 2.0）</Text></span>}
                      name="qwen3AudioGain"
                    >
                      <InputNumber min={1.0} max={10.0} step={0.5} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                      label={<span>VAD 检测阈值<Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>语音活动检测灵敏度，值越低越敏感（默认 0.5）</Text></span>}
                      name="qwen3VadThreshold"
                    >
                      <InputNumber min={0.1} max={0.9} step={0.05} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                      label={<span>最短静音时长（秒）<Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>多长静音后触发分段（默认 0.5）</Text></span>}
                      name="qwen3VadMinSilenceDuration"
                    >
                      <InputNumber min={0.1} max={3.0} step={0.1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                      label={<span>最长语音时长（秒）<Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>超过此时长强制分段（默认 30）</Text></span>}
                      name="qwen3VadMaxSpeechDuration"
                    >
                      <InputNumber min={5} max={120} step={5} style={{ width: '100%' }} />
                    </Form.Item>
                  </>
                )}

                {realtimeEngine === 'streaming-zipformer' && (
                  <>
                    <Form.Item
                      label={<span>音频增益<Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>放大麦克风音量（默认 2.0）</Text></span>}
                      name="zipformerAudioGain"
                    >
                      <InputNumber min={1.0} max={10.0} step={0.5} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                      label={<span>静音检测阈值1（秒）<Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>有标点时，多长静音后结束分段（默认 2.4）</Text></span>}
                      name="rule1MinTrailingSilence"
                    >
                      <InputNumber min={0.5} max={5.0} step={0.1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                      label={<span>静音检测阈值2（秒）<Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>无标点时，多长静音后结束分段（默认 1.2）</Text></span>}
                      name="rule2MinTrailingSilence"
                    >
                      <InputNumber min={0.3} max={3.0} step={0.1} style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item
                      label={<span>最长语音时长（秒）<Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>超过此时长强制分段（默认 20）</Text></span>}
                      name="rule3MinUtteranceLength"
                    >
                      <InputNumber min={5} max={60} step={5} style={{ width: '100%' }} />
                    </Form.Item>
                  </>
                )}

                <Text type="secondary" style={{ fontSize: 12 }}>
                  Qwen3-ASR + VAD 模式准确率更高，但延迟稍大（1-2秒）；Zipformer 流式模式延迟极低但准确率较低。
                </Text>
              </Form>
            ),
          },
          {
            key: 'file-recognition',
            label: '文件识别',
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
                <Form.Item
                  label={<span>说话人聚类阈值<Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>值越高识别出的说话人越少（默认 0.85）</Text></span>}
                  name="clusteringThreshold"
                >
                  <InputNumber min={0.1} max={1.0} step={0.05} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item
                  label={<span>VAD 检测阈值<Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>语音活动检测灵敏度，值越高越严格（默认 0.5）</Text></span>}
                  name="vadThreshold"
                >
                  <InputNumber min={0.1} max={1.0} step={0.05} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item
                  label={<span>最短静音时长（秒）<Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>值越大分段越少（默认 1.5）</Text></span>}
                  name="minSilenceDuration"
                >
                  <InputNumber min={0.5} max={5.0} step={0.1} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item
                  label={<span>最短语音时长（秒）<Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>过短的片段会被过滤（默认 1.0）</Text></span>}
                  name="minSpeechDuration"
                >
                  <InputNumber min={0.5} max={5.0} step={0.1} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item
                  label={<span>最长分段时长（秒）<Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>超长语音段会被强制切分（默认 30）</Text></span>}
                  name="maxSegmentDuration"
                >
                  <InputNumber min={10} max={120} step={5} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item
                  label={<span>最大文件时长（秒）<Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>超出会被拒绝（默认 7200 = 2小时）</Text></span>}
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
          {
            key: 'shortcuts',
            label: '快捷键',
            children: (
              <div style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <div>
                    <Text strong>开始/停止录音</Text>
                    <br />
                    <Text type="secondary" style={{ fontSize: 12 }}>全局快捷键，在任何场景下触发浮动录音窗口</Text>
                  </div>
                  <Text code style={{ fontSize: 14 }}>Ctrl + Shift + R</Text>
                </div>
                <div style={{ marginTop: 16 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    快捷键为全局快捷键，即使应用在后台也可触发。如果快捷键与其他应用冲突，启动时会提示注册失败。
                  </Text>
                </div>
              </div>
            ),
          },
        ]}
      />
    </Modal>
  )
}
