import { useState, useEffect } from 'react'
import { Modal, Tabs, Form, Select, Input, InputNumber, Typography, Button, Space, Progress, Tag, message, Tooltip } from 'antd'
import { DownloadOutlined, DeleteOutlined, CloseCircleOutlined, CheckCircleFilled, QuestionCircleOutlined } from '@ant-design/icons'

const { Text } = Typography

// 带单位的 InputNumber 包装组件
function InputNumberWithUnit({ value, onChange, unit, ...props }: any) {
  return (
    <div className="input-wrapper">
      <InputNumber value={value} onChange={onChange} {...props} />
      <span className="unit-text">{unit || ''}</span>
    </div>
  )
}

interface LLMProviderInfo {
  id: string
  name: string
  baseUrl: string
  models: Array<{ id: string; name: string }>
}

interface ModelRegistryEntry {
  id: string
  name: string
  description: string
  category: 'asr' | 'auxiliary'
  size: number
  bundled: boolean
  downloadUrl?: string
  status: 'installed' | 'not-installed' | 'downloading'
  location?: string
  deletable: boolean
}

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

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
}

function ModelListItem({ model, progress, onDownload, onCancel, onDelete }: {
  model: ModelRegistryEntry
  progress?: { percent: number; downloadedBytes: number; totalBytes: number }
  onDownload: (id: string) => void
  onCancel: (id: string) => void
  onDelete: (id: string) => void
}) {
  const isDownloading = model.status === 'downloading' || progress
  const isInstalled = model.status === 'installed' && !isDownloading

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 12px', borderBottom: '1px solid #f0f0f0',
      opacity: model.status === 'not-installed' && !isDownloading ? 0.55 : 1,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text strong>{model.name}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{model.description}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{formatSize(model.size)}</Text>
          {isInstalled && <Tag color="green" style={{ margin: 0, fontSize: 11, lineHeight: '18px', padding: '0 6px' }}><CheckCircleFilled /> 已安装</Tag>}
        </div>
        {isDownloading && progress && (
          <div style={{ marginTop: 4 }}>
            <Progress
              percent={progress.percent}
              size="small"
              format={(p) => `${formatSize(progress.downloadedBytes)} / ${formatSize(progress.totalBytes)}`}
            />
          </div>
        )}
      </div>
      <div style={{ marginLeft: 12, flexShrink: 0 }}>
        {isDownloading ? (
          <Button size="small" icon={<CloseCircleOutlined />} onClick={() => onCancel(model.id)}>取消</Button>
        ) : isInstalled && model.deletable ? (
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => onDelete(model.id)}>删除</Button>
        ) : model.status === 'not-installed' && model.downloadUrl ? (
          <Button size="small" type="primary" icon={<DownloadOutlined />} onClick={() => onDownload(model.id)}>下载</Button>
        ) : null}
      </div>
    </div>
  )
}

export function SettingsModal({ open, onClose, availableModels, onSettingsChange }: SettingsModalProps) {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [realtimeEngine, setRealtimeEngine] = useState('qwen3-simulated-streaming')
  const [llmProviders, setLlmProviders] = useState<LLMProviderInfo[]>([])
  const [selectedProvider, setSelectedProvider] = useState('dashscope')
  const [providerModels, setProviderModels] = useState<Array<{ id: string; name: string }>>([])
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [modelRegistry, setModelRegistry] = useState<ModelRegistryEntry[]>([])
  const [realtimeModels, setRealtimeModels] = useState<ModelRegistryEntry[]>([])
  const [offlineModels, setOfflineModels] = useState<ModelRegistryEntry[]>([])
  const [auxiliaryModels, setAuxiliaryModels] = useState<ModelRegistryEntry[]>([])
  const [engines, setEngines] = useState<Array<{ id: string; name: string; type: string; description: string; models: string[]; available: boolean }>>([])
  const [downloadPath, setDownloadPath] = useState('')
  const [ffmpegExists, setFfmpegExists] = useState(true)
  const [defaultModelPath, setDefaultModelPath] = useState('')
  const [defaultFfmpegPath, setDefaultFfmpegPath] = useState('')
  const [downloadProgress, setDownloadProgress] = useState<Record<string, { percent: number; downloadedBytes: number; totalBytes: number }>>({})

  const refreshModelRegistry = () => {
    window.electronAPI.getModelRegistry().then(({ models, realtimeModels: rt, offlineModels: ol, auxiliaryModels: aux, downloadPath: dp, ffmpegExists: fe, defaultModelPath: dmp, defaultFfmpegPath: dfp }) => {
      setModelRegistry(models)
      setRealtimeModels(rt)
      setOfflineModels(ol)
      setAuxiliaryModels(aux)
      setDownloadPath(dp)
      setFfmpegExists(fe)
      setDefaultModelPath(dmp)
      setDefaultFfmpegPath(dfp)
    })
    window.electronAPI.getEngineRegistry().then(setEngines)
  }

  useEffect(() => {
    if (open) {
      refreshModelRegistry()

      Promise.all([
        window.electronAPI.getSettings(),
        window.electronAPI.getLlmProviders(),
      ]).then(([settings, providers]) => {
        setLlmProviders(providers)

        const provider = settings.llmProvider || 'dashscope'
        setSelectedProvider(provider)
        const providerInfo = providers.find((p: LLMProviderInfo) => p.id === provider)
        setProviderModels(providerInfo?.models || [])

        const keys: Record<string, string> = { ...(settings.llmApiKeys || {}) }
        if (!keys.dashscope && settings.llmApiKey) {
          keys.dashscope = settings.llmApiKey
        }
        setApiKeys(keys)

        const asrParams = settings.asrParams || {}
        const engineConfig = settings.realtimeEngineConfig || {}
        const zipformerParams = engineConfig.zipformerParams || settings.realtimeParams || {}
        const qwen3Params = engineConfig.qwen3Params || {}

        form.setFieldsValue({
          defaultModel: settings.defaultModel || availableModels.find(m => m.available)?.id || 'qwen3-asr',
          defaultStrategy: settings.defaultStrategy || 'auto',
          llmProvider: provider,
          llmModel: settings.llmModel || (providerInfo?.models[0]?.id || ''),
          llmApiKey: keys[provider] || '',
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
    } else {
      setDownloadProgress({})
    }
  }, [open, form, availableModels])

  // Listen for download progress
  useEffect(() => {
    const unsubProgress = window.electronAPI.onModelDownloadProgress((data) => {
      if (data.percent === -1) {
        // -1 signals retrying, show as 0% with "retrying" indicator
        setDownloadProgress(prev => ({ ...prev, [data.modelId]: { percent: 0, downloadedBytes: 0, totalBytes: data.totalBytes } }))
      } else {
        setDownloadProgress(prev => ({ ...prev, [data.modelId]: { percent: data.percent, downloadedBytes: data.downloadedBytes, totalBytes: data.totalBytes } }))
      }
    })
    const unsubComplete = window.electronAPI.onModelDownloadComplete((data) => {
      setDownloadProgress(prev => {
        const next = { ...prev }
        delete next[data.modelId]
        return next
      })
      if (data.success) {
        message.success('模型下载完成')
      } else if (data.error) {
        message.error(`下载失败: ${data.error}`)
      }
      refreshModelRegistry()
    })
    return () => { unsubProgress(); unsubComplete() }
  }, [])

  const handleDownload = async (modelId: string) => {
    const result = await window.electronAPI.downloadModel(modelId)
    if (!result.success && result.error) {
      // Only show error for pre-download validation failures (disk space, already installed, etc.)
      // Network errors during download are handled by onModelDownloadComplete
      message.error(result.error)
    }
  }

  const handleCancel = async (modelId: string) => {
    await window.electronAPI.cancelModelDownload(modelId)
    setDownloadProgress(prev => {
      const next = { ...prev }
      delete next[modelId]
      return next
    })
    refreshModelRegistry()
  }

  const handleDelete = (modelId: string) => {
    const model = modelRegistry.find(m => m.id === modelId)
    Modal.confirm({
      title: '删除模型',
      content: `确定要删除 ${model?.name || modelId} 吗？删除后需要重新下载。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        const result = await window.electronAPI.deleteModel(modelId)
        if (result.success) {
          message.success('模型已删除')
          refreshModelRegistry()
        } else {
          message.error(result.error || '删除失败')
        }
      },
    })
  }

  const handleProviderChange = (providerId: string) => {
    const currentKey = form.getFieldValue('llmApiKey') || ''
    setApiKeys(prev => ({ ...prev, [selectedProvider]: currentKey }))

    setSelectedProvider(providerId)
    const providerInfo = llmProviders.find(p => p.id === providerId)
    const models = providerInfo?.models || []
    setProviderModels(models)

    form.setFieldsValue({
      llmProvider: providerId,
      llmModel: models[0]?.id || '',
      llmApiKey: apiKeys[providerId] || '',
    })
  }

  const handleOk = async () => {
    const values = form.getFieldsValue()
    const currentSettings = await window.electronAPI.getSettings()
    const finalApiKeys = { ...apiKeys, [selectedProvider]: values.llmApiKey || '' }

    const settings = {
      ...currentSettings,
      defaultModel: values.defaultModel,
      defaultStrategy: values.defaultStrategy,
      llmProvider: values.llmProvider,
      llmModel: values.llmModel,
      llmApiKey: finalApiKeys.dashscope || '',
      llmApiKeys: finalApiKeys,
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

  // Realtime engine options from engine registry
  const realtimeEngineOptions = engines
    .filter(e => e.type === 'realtime')
    .map(e => ({
      value: e.id,
      label: e.available ? e.name : `${e.name}（未下载）`,
      disabled: !e.available,
    }))

  // Offline model options from engine registry
  const offlineModelOptions = engines
    .filter(e => e.type === 'offline')
    .map(e => {
      return {
        value: e.id === 'sensevoice-offline' ? 'sensevoice-small' : 'qwen3-asr',
        label: e.available ? e.name : `${e.name}（未下载）`,
        disabled: !e.available,
      }
    })

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
            key: 'models',
            label: '模型管理',
            children: (
              <div style={{ marginTop: 8 }}>
                <Text strong style={{ fontSize: 13 }}>实时转写模型</Text>
                <div style={{ border: '1px solid #f0f0f0', borderRadius: 6, marginTop: 8, marginBottom: 16 }}>
                  {realtimeModels.map(m => (
                    <ModelListItem
                      key={`rt-${m.id}`}
                      model={m}
                      progress={downloadProgress[m.id]}
                      onDownload={handleDownload}
                      onCancel={handleCancel}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
                <Text strong style={{ fontSize: 13 }}>文件转写模型</Text>
                <div style={{ border: '1px solid #f0f0f0', borderRadius: 6, marginTop: 8, marginBottom: 16 }}>
                  {offlineModels.map(m => (
                    <ModelListItem
                      key={`ol-${m.id}`}
                      model={m}
                      progress={downloadProgress[m.id]}
                      onDownload={handleDownload}
                      onCancel={handleCancel}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
                <Text strong style={{ fontSize: 13 }}>辅助模型</Text>
                <div style={{ border: '1px solid #f0f0f0', borderRadius: 6, marginTop: 8, marginBottom: 12 }}>
                  {auxiliaryModels.map(m => (
                    <ModelListItem
                      key={`aux-${m.id}`}
                      model={m}
                      progress={downloadProgress[m.id]}
                      onDownload={handleDownload}
                      onCancel={handleCancel}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {downloadPath && `手动下载的模型请放置到：${downloadPath}`}
                </Text>
              </div>
            ),
          },
          {
            key: 'realtime',
            label: '实时录音',
            children: (
              <Form form={form} layout="horizontal" labelCol={{ span: 5 }} wrapperCol={{ span: 17 }} style={{ marginTop: 16 }}>
                <style>{`
                  .ant-form-item { margin-bottom: 12px; }
                  .input-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                  }
                  .input-wrapper .ant-select,
                  .input-wrapper .ant-input-number {
                    flex: 1;
                  }
                  .input-wrapper .unit-text {
                    width: 32px;
                    text-align: center;
                    color: rgba(0, 0, 0, 0.65);
                    font-size: 14px;
                    flex-shrink: 0;
                  }
                  .label-with-tooltip {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                  }
                  .label-with-tooltip .anticon {
                    color: #999;
                    cursor: help;
                    font-size: 14px;
                  }
                `}</style>
                <Form.Item label="识别模型" name="realtimeEngine">
                  <Select
                    onChange={(v) => {
                      const eng = engines.find(e => e.id === v)
                      if (eng && !eng.available) {
                        message.info('该模型未下载，请前往"模型管理"下载后使用')
                        return
                      }
                      setRealtimeEngine(v)
                    }}
                    options={realtimeEngineOptions}
                  />
                </Form.Item>

                {realtimeEngine === 'qwen3-simulated-streaming' && (
                  <>
                    <Form.Item label="音频增益" name="qwen3AudioGain">
                      <InputNumberWithUnit min={1.0} max={10.0} step={0.5} unit="倍" />
                    </Form.Item>
                    <Form.Item
                      label={
                        <span className="label-with-tooltip">
                          VAD 阈值
                          <Tooltip title="语音活动检测灵敏度，值越低越敏感（默认 0.5）">
                            <QuestionCircleOutlined />
                          </Tooltip>
                        </span>
                      }
                      name="qwen3VadThreshold"
                    >
                      <InputNumberWithUnit min={0.1} max={0.9} step={0.05} />
                    </Form.Item>
                    <Form.Item
                      label={
                        <span className="label-with-tooltip">
                          最短静音
                          <Tooltip title="多长静音后触发分段（默认 0.5）">
                            <QuestionCircleOutlined />
                          </Tooltip>
                        </span>
                      }
                      name="qwen3VadMinSilenceDuration"
                    >
                      <InputNumberWithUnit min={0.1} max={3.0} step={0.1} unit="秒" />
                    </Form.Item>
                    <Form.Item
                      label={
                        <span className="label-with-tooltip">
                          最长语音
                          <Tooltip title="超过此时长强制分段（默认 30）">
                            <QuestionCircleOutlined />
                          </Tooltip>
                        </span>
                      }
                      name="qwen3VadMaxSpeechDuration"
                    >
                      <InputNumberWithUnit min={5} max={120} step={5} unit="秒" />
                    </Form.Item>
                  </>
                )}

                {realtimeEngine === 'streaming-zipformer' && (
                  <>
                    <Form.Item label="音频增益" name="zipformerAudioGain">
                      <InputNumberWithUnit min={1.0} max={10.0} step={0.5} unit="倍" />
                    </Form.Item>
                    <Form.Item
                      label={
                        <span className="label-with-tooltip">
                          静音阈值1
                          <Tooltip title="有标点时，多长静音后结束分段（默认 2.4）">
                            <QuestionCircleOutlined />
                          </Tooltip>
                        </span>
                      }
                      name="rule1MinTrailingSilence"
                    >
                      <InputNumberWithUnit min={0.5} max={5.0} step={0.1} unit="秒" />
                    </Form.Item>
                    <Form.Item
                      label={
                        <span className="label-with-tooltip">
                          静音阈值2
                          <Tooltip title="无标点时，多长静音后结束分段（默认 1.2）">
                            <QuestionCircleOutlined />
                          </Tooltip>
                        </span>
                      }
                      name="rule2MinTrailingSilence"
                    >
                      <InputNumberWithUnit min={0.3} max={3.0} step={0.1} unit="秒" />
                    </Form.Item>
                    <Form.Item
                      label={
                        <span className="label-with-tooltip">
                          最长语音
                          <Tooltip title="超过此时长强制分段（默认 20）">
                            <QuestionCircleOutlined />
                          </Tooltip>
                        </span>
                      }
                      name="rule3MinUtteranceLength"
                    >
                      <InputNumberWithUnit min={5} max={60} step={5} unit="秒" />
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
              <Form form={form} layout="horizontal" labelCol={{ span: 5 }} wrapperCol={{ span: 17 }} style={{ marginTop: 16 }}>
                <style>{`
                  .ant-form-item { margin-bottom: 12px; }
                  .input-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                  }
                  .input-wrapper .ant-select,
                  .input-wrapper .ant-input-number {
                    flex: 1;
                  }
                  .input-wrapper .unit-text {
                    width: 32px;
                    text-align: center;
                    color: rgba(0, 0, 0, 0.65);
                    font-size: 14px;
                    flex-shrink: 0;
                  }
                  .label-with-tooltip {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                  }
                  .label-with-tooltip .anticon {
                    color: #999;
                    cursor: help;
                    font-size: 14px;
                  }
                `}</style>
                <Form.Item label="默认模型" name="defaultModel">
                  <Select
                    options={offlineModelOptions}
                    onSelect={(value) => {
                      const opt = offlineModelOptions.find(o => o.value === value)
                      if (opt?.disabled) {
                        message.info('该模型未下载，请前往"模型管理"下载后使用')
                      }
                    }}
                  />
                </Form.Item>
                <Form.Item label="默认策略" name="defaultStrategy">
                  <Select options={strategyOptions} />
                </Form.Item>
                <Form.Item
                  label={
                    <span className="label-with-tooltip">
                      聚类阈值
                      <Tooltip title="值越高识别出的说话人越少（默认 0.85）">
                        <QuestionCircleOutlined />
                      </Tooltip>
                    </span>
                  }
                  name="clusteringThreshold"
                >
                  <InputNumberWithUnit min={0.1} max={1.0} step={0.05} />
                </Form.Item>
                <Form.Item
                  label={
                    <span className="label-with-tooltip">
                      VAD 阈值
                      <Tooltip title="语音活动检测灵敏度，值越高越严格（默认 0.5）">
                        <QuestionCircleOutlined />
                      </Tooltip>
                    </span>
                  }
                  name="vadThreshold"
                >
                  <InputNumberWithUnit min={0.1} max={1.0} step={0.05} />
                </Form.Item>
                <Form.Item
                  label={
                    <span className="label-with-tooltip">
                      最短静音
                      <Tooltip title="值越大分段越少（默认 1.5）">
                        <QuestionCircleOutlined />
                      </Tooltip>
                    </span>
                  }
                  name="minSilenceDuration"
                >
                  <InputNumberWithUnit min={0.5} max={5.0} step={0.1} unit="秒" />
                </Form.Item>
                <Form.Item
                  label={
                    <span className="label-with-tooltip">
                      最短语音
                      <Tooltip title="过短的片段会被过滤（默认 1.0）">
                        <QuestionCircleOutlined />
                      </Tooltip>
                    </span>
                  }
                  name="minSpeechDuration"
                >
                  <InputNumberWithUnit min={0.5} max={5.0} step={0.1} unit="秒" />
                </Form.Item>
                <Form.Item
                  label={
                    <span className="label-with-tooltip">
                      最长分段
                      <Tooltip title="超长语音段会被强制切分（默认 30）">
                        <QuestionCircleOutlined />
                      </Tooltip>
                    </span>
                  }
                  name="maxSegmentDuration"
                >
                  <InputNumberWithUnit min={10} max={120} step={5} unit="秒" />
                </Form.Item>
                <Form.Item
                  label={
                    <span className="label-with-tooltip">
                      最大时长
                      <Tooltip title="超出会被拒绝（默认 7200 = 2小时）">
                        <QuestionCircleOutlined />
                      </Tooltip>
                    </span>
                  }
                  name="maxDurationSeconds"
                >
                  <InputNumberWithUnit min={600} max={14400} step={600} unit="秒" />
                </Form.Item>
              </Form>
            ),
          },
          {
            key: 'llm',
            label: 'LLM 配置',
            children: (
              <Form form={form} layout="horizontal" labelCol={{ span: 5 }} wrapperCol={{ span: 17 }} style={{ marginTop: 16 }}>
                <style>{`
                  .ant-form-item { margin-bottom: 12px; }
                `}</style>
                <Form.Item label="模型厂商" name="llmProvider">
                  <Select
                    onChange={handleProviderChange}
                    options={llmProviders.map(p => ({ value: p.id, label: p.name }))}
                  />
                </Form.Item>
                <Form.Item label="模型" name="llmModel">
                  <Select
                    options={providerModels.map(m => ({ value: m.id, label: m.name }))}
                    placeholder="选择模型"
                  />
                </Form.Item>
                <Form.Item label="API Key" name="llmApiKey">
                  <Input.Password placeholder="请输入 API Key" />
                </Form.Item>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  API Key 用于调用大模型生成全文摘要、会议纪要等分析内容。每个厂商需单独配置 API Key。
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
