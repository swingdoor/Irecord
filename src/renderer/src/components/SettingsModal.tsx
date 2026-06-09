import { useState, useEffect } from 'react'
import { Modal, Tabs, Form, Select, Input, InputNumber, Switch, Typography, Button, Space, Progress, Tag, message, Tooltip } from 'antd'
import { DownloadOutlined, DeleteOutlined, CloseCircleOutlined, CheckCircleFilled, QuestionCircleOutlined, PlusOutlined } from '@ant-design/icons'

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
  const [llmProviders, setLlmProviders] = useState<LLMProviderInfo[]>([])
  const [selectedProvider, setSelectedProvider] = useState('dashscope')
  const [providerModels, setProviderModels] = useState<Array<{ id: string; name: string }>>([])
  const [modelSearch, setModelSearch] = useState('')
  // 用户自定义的模型代码，按厂商分组持久化（value 即原始 code，直传 API）
  const [customModels, setCustomModels] = useState<Record<string, string[]>>({})
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [modelRegistry, setModelRegistry] = useState<ModelRegistryEntry[]>([])
  const [offlineModels, setOfflineModels] = useState<ModelRegistryEntry[]>([])
  const [auxiliaryModels, setAuxiliaryModels] = useState<ModelRegistryEntry[]>([])
  const [engines, setEngines] = useState<Array<{ id: string; name: string; type: string; description: string; models: string[]; available: boolean }>>([])
  const [downloadPath, setDownloadPath] = useState('')
  const [ffmpegExists, setFfmpegExists] = useState(true)
  const [defaultModelPath, setDefaultModelPath] = useState('')
  const [defaultFfmpegPath, setDefaultFfmpegPath] = useState('')
  const [downloadProgress, setDownloadProgress] = useState<Record<string, { percent: number; downloadedBytes: number; totalBytes: number }>>({})

  const refreshModelRegistry = () => {
    window.electronAPI.getModelRegistry().then(({ models, offlineModels: ol, auxiliaryModels: aux, downloadPath: dp, ffmpegExists: fe, defaultModelPath: dmp, defaultFfmpegPath: dfp }) => {
      setModelRegistry(models)
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

        // 迁移：若已保存的 llmModel 是个非内置的 code（旧版自定义输入），
        // 补进当前厂商的自定义列表，保证能回显且可删除
        const savedCustom: Record<string, string[]> = { ...(settings.llmCustomModels || {}) }
        const savedModel = settings.llmModel
        const builtinIds = (providerInfo?.models || []).map((m: { id: string }) => m.id)
        if (savedModel && !builtinIds.includes(savedModel)) {
          const list = savedCustom[provider] || []
          if (!list.includes(savedModel)) savedCustom[provider] = [...list, savedModel]
        }
        setCustomModels(savedCustom)

        const asrParams = settings.asrParams || {}

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
          maxSegmentDuration: asrParams.maxSegmentDuration ?? 60,
          maxDurationSeconds: asrParams.maxDurationSeconds ?? 7200,
          debugAsrLog: settings.debugAsrLog ?? false,
        })
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
    setModelSearch('')
    const providerInfo = llmProviders.find(p => p.id === providerId)
    const models = providerInfo?.models || []
    setProviderModels(models)

    form.setFieldsValue({
      llmProvider: providerId,
      llmModel: models[0]?.id || '',
      llmApiKey: apiKeys[providerId] || '',
    })
  }

  // 把输入的模型代码加入当前厂商的自定义列表，并选中它（code 直传 API，无需映射）
  const addCustomModel = (code: string) => {
    const c = code.trim()
    if (!c) return
    const builtinIds = providerModels.map(m => m.id)
    setCustomModels(prev => {
      const list = prev[selectedProvider] || []
      // 内置已有或自定义已有则不重复添加
      if (builtinIds.includes(c) || list.includes(c)) return prev
      return { ...prev, [selectedProvider]: [...list, c] }
    })
    form.setFieldValue('llmModel', c)
    setModelSearch('')
  }

  // 删除当前厂商的某个自定义模型代码；若删的正是已选中的，回退到首个内置模型
  const removeCustomModel = (code: string) => {
    setCustomModels(prev => {
      const list = (prev[selectedProvider] || []).filter(m => m !== code)
      return { ...prev, [selectedProvider]: list }
    })
    if (form.getFieldValue('llmModel') === code) {
      form.setFieldValue('llmModel', providerModels[0]?.id || '')
    }
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
      llmCustomModels: customModels,
      debugAsrLog: values.debugAsrLog ?? false,
      asrParams: {
        clusteringThreshold: values.clusteringThreshold,
        vadThreshold: values.vadThreshold,
        minSilenceDuration: values.minSilenceDuration,
        minSpeechDuration: values.minSpeechDuration,
        maxSegmentDuration: values.maxSegmentDuration,
        maxDurationSeconds: values.maxDurationSeconds,
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
                      <Tooltip title="超长语音段会被强制切分（默认 60）">
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
                <Form.Item
                  label={
                    <span className="label-with-tooltip">
                      诊断日志
                      <Tooltip title="开启后，文件识别过程会写入诊断日志到用户数据目录的 logs 文件夹，用于排查识别报错。正式使用可关闭。">
                        <QuestionCircleOutlined />
                      </Tooltip>
                    </span>
                  }
                  name="debugAsrLog"
                  valuePropName="checked"
                >
                  <Switch />
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
                    showSearch
                    placeholder="选择或输入模型代码"
                    notFoundContent={null}
                    searchValue={modelSearch}
                    onSearch={setModelSearch}
                    onChange={() => setModelSearch('')}
                    filterOption={(input, option) =>
                      // 只对真实模型项做过滤；"添加"项始终保留
                      (option as any)?.kind === 'add'
                        ? true
                        : String((option as any)?.code ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                    optionRender={(option) => {
                      const data = option.data as any
                      if (data.kind === 'add') {
                        return (
                          <Space>
                            <PlusOutlined />
                            <span>添加自定义模型：<Text code>{data.code}</Text></span>
                          </Space>
                        )
                      }
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            <Text code>{data.code}</Text>
                            {data.builtinName && <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>{data.builtinName}</Text>}
                          </span>
                          {data.kind === 'custom' && (
                            <DeleteOutlined
                              style={{ color: '#999', flexShrink: 0 }}
                              onClick={(e) => {
                                e.stopPropagation()
                                removeCustomModel(data.code)
                              }}
                            />
                          )}
                        </div>
                      )
                    }}
                    onSelect={(value) => {
                      // 选中"添加"项时，value 形如 "__add__:<code>"，转为真正添加动作
                      if (typeof value === 'string' && value.startsWith('__add__:')) {
                        addCustomModel(value.slice('__add__:'.length))
                      }
                    }}
                    options={(() => {
                      // value 一律是原始模型代码，直传 API，无需映射
                      const builtinIds = providerModels.map(m => m.id)
                      const customList = customModels[selectedProvider] || []
                      const opts: any[] = []
                      // 内置模型（显示 code + 友好名）
                      for (const m of providerModels) {
                        opts.push({ value: m.id, code: m.id, builtinName: m.name, label: m.id, kind: 'builtin' })
                      }
                      // 已保存的自定义模型（可删除）
                      for (const code of customList) {
                        if (builtinIds.includes(code)) continue
                        opts.push({ value: code, code, label: code, kind: 'custom' })
                      }
                      // 兜底：当前选中值既非内置也不在自定义列表时，补一项以正确回显
                      const current = form.getFieldValue('llmModel')
                      if (current && !builtinIds.includes(current) && !customList.includes(current)) {
                        opts.push({ value: current, code: current, label: current, kind: 'custom' })
                      }
                      // 正在输入且不存在的代码 → 提供"添加"项
                      const typed = modelSearch.trim()
                      if (typed && !builtinIds.includes(typed) && !customList.includes(typed)) {
                        opts.push({ value: `__add__:${typed}`, code: typed, label: typed, kind: 'add' })
                      }
                      return opts
                    })()}
                  />
                </Form.Item>
                <Form.Item wrapperCol={{ offset: 5, span: 17 }} style={{ marginTop: -4, marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    输入模型代码（如 qwen-plus-latest）可添加自定义模型，自定义项可删除。
                  </Text>
                </Form.Item>
                <Form.Item label="API Key" name="llmApiKey">
                  <Input.Password placeholder="请输入 API Key" />
                </Form.Item>
                <Form.Item wrapperCol={{ offset: 5, span: 17 }} style={{ marginTop: -4, marginBottom: 0 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    API Key 用于调用大模型生成全文摘要、会议纪要等分析内容。每个厂商需单独配置 API Key。
                  </Text>
                </Form.Item>
              </Form>
            ),
          },
        ]}
      />
    </Modal>
  )
}
