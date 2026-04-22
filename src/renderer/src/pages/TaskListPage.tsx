import { useEffect, useCallback, useState } from 'react'
import { Typography, Alert, Button, Segmented, Space, Modal, Tabs } from 'antd'
import { BgColorsOutlined, SettingOutlined } from '@ant-design/icons'
import { useAppStore, Task, RealtimeRecording, KnowledgeDoc } from '../stores/appStore'
import { FeatureCards } from '../components/FeatureCards'
import { TaskTable } from '../components/TaskTable'
import { RealtimeRecordingTable } from '../components/RealtimeRecordingTable'
import { KnowledgeTable } from '../components/KnowledgeTable'
import { CreateDocModal } from '../components/CreateDocModal'
import { SettingsModal } from '../components/SettingsModal'

const { Title } = Typography

interface TaskListPageProps {
  themeMode: 'default' | 'monochrome'
  onThemeChange: (mode: 'default' | 'monochrome') => void
}

export default function TaskListPage({ themeMode, onThemeChange }: TaskListPageProps) {
  const {
    tasks, refreshTasks,
    realtimeRecordings, refreshRealtimeRecordings,
    knowledgeDocs, refreshKnowledgeDocs,
    templates, refreshTemplates,
    setPage, setCurrentTaskId, setCurrentRealtimeRecordingId, setCurrentKnowledgeDocId
  } = useAppStore()
  const [processingStartTime, setProcessingStartTime] = useState(Date.now())
  const [selectedModel, setSelectedModel] = useState('qwen3-asr')
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; available: boolean }>>([])
  const [addErrors, setAddErrors] = useState<string[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [streamingModelAvailable, setStreamingModelAvailable] = useState(false)
  const [activeTab, setActiveTab] = useState<string>('realtime')
  const [createDocModalOpen, setCreateDocModalOpen] = useState(false)

  useEffect(() => {
    refreshTasks()
    refreshRealtimeRecordings()
    refreshKnowledgeDocs()
    refreshTemplates()
    Promise.all([
      window.electronAPI.getAvailableModels(),
      window.electronAPI.getSettings(),
      window.electronAPI.checkStreamingModel(),
    ]).then(([models, settings, streamingModel]) => {
      setAvailableModels(models)
      const defaultModel = settings.defaultModel || models.find(m => m.available)?.id || 'qwen3-asr'
      setSelectedModel(defaultModel)
      setStreamingModelAvailable(streamingModel.available)
      // Restore active tab from settings
      if (settings.activeTab) setActiveTab(settings.activeTab)
    })
    window.electronAPI.getCurrentTaskInfo().then(info => {
      if (info.startTime) setProcessingStartTime(info.startTime)
    })
    const unsub = window.electronAPI.onTaskStatusChanged((data) => {
      if (data.startTime) setProcessingStartTime(data.startTime)
      refreshTasks()
    })
    return () => { unsub() }
  }, [refreshTasks, refreshRealtimeRecordings, refreshKnowledgeDocs, refreshTemplates])

  // 轮询：当有 generating 状态的文档时，每 3 秒刷新
  useEffect(() => {
    const hasGenerating = knowledgeDocs.some(d => d.status === 'generating')
    if (!hasGenerating) return

    const timer = setInterval(() => {
      refreshKnowledgeDocs()
    }, 3000)

    return () => clearInterval(timer)
  }, [knowledgeDocs, refreshKnowledgeDocs])

  const handleSettingsChange = useCallback((settings: Record<string, any>) => {
    if (settings.defaultModel) setSelectedModel(settings.defaultModel)
  }, [])

  const handleThemeChange = useCallback(async (mode: 'default' | 'monochrome') => {
    onThemeChange(mode)
    const settings = await window.electronAPI.getSettings()
    await window.electronAPI.saveSettings({ ...settings, themeMode: mode })
  }, [onThemeChange])

  const handleAddFiles = useCallback(async () => {
    setAddErrors([])

    // 转写前校验资源
    const { ffmpegExists, hasAnyModel } = await window.electronAPI.checkResources()
    if (!ffmpegExists || !hasAnyModel) {
      const missing = [
        !ffmpegExists ? 'FFmpeg' : null,
        !hasAnyModel ? '模型' : null,
      ].filter(Boolean).join(' 和 ')

      Modal.error({
        title: '无法开始转写',
        content: `缺少必要资源：${missing}。请先在设置中配置路径。`,
        okText: '去设置',
        onOk: () => setSettingsOpen(true),
      })
      return
    }

    const result = await window.electronAPI.addFiles(selectedModel)
    if (result.errors?.length) setAddErrors(result.errors)
    refreshTasks()
  }, [refreshTasks, selectedModel])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setAddErrors([])

    // 转写前校验资源
    const { ffmpegExists, hasAnyModel } = await window.electronAPI.checkResources()
    if (!ffmpegExists || !hasAnyModel) {
      const missing = [
        !ffmpegExists ? 'FFmpeg' : null,
        !hasAnyModel ? '模型' : null,
      ].filter(Boolean).join(' 和 ')

      Modal.error({
        title: '无法开始转写',
        content: `缺少必要资源：${missing}。请先在设置中配置路径。`,
        okText: '去设置',
        onOk: () => setSettingsOpen(true),
      })
      return
    }

    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      const result = await window.electronAPI.addDroppedFiles(files.map(f => f.path), selectedModel)
      if (result.errors?.length) setAddErrors(result.errors)
      refreshTasks()
    }
  }, [refreshTasks, selectedModel])

  const handleDelete = useCallback(async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation()
    await window.electronAPI.deleteTask(taskId)
    refreshTasks()
  }, [refreshTasks])

  const handleRestart = useCallback(async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation()
    await window.electronAPI.restartTask(taskId)
    refreshTasks()
  }, [refreshTasks])

  const handleCancel = useCallback(async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation()
    await window.electronAPI.cancelTask(taskId)
    refreshTasks()
  }, [refreshTasks])

  const handleViewDetail = useCallback((task: Task) => {
    if (task.status !== 'completed' && task.status !== 'pending_analysis') return
    setCurrentTaskId(task.id)
    setPage('taskDetail')
  }, [setCurrentTaskId, setPage])

  const handleRecord = useCallback(() => {
    setPage('recording')
  }, [setPage])

  const handleExportAudio = useCallback(async (_e: React.MouseEvent, filePath: string) => {
    await window.electronAPI.exportAudio(filePath)
  }, [])

  const handleDeepAnalysisFromList = useCallback(async (_e: React.MouseEvent, taskId: string) => {
    await window.electronAPI.startDeepAnalysis(taskId)
    refreshTasks()
  }, [refreshTasks])

  const handleTabChange = useCallback(async (key: string) => {
    setActiveTab(key)
    const settings = await window.electronAPI.getSettings()
    await window.electronAPI.saveSettings({ ...settings, activeTab: key })
  }, [])

  const handleViewRecording = useCallback((recording: RealtimeRecording) => {
    setCurrentRealtimeRecordingId(recording.id)
    setPage('realtimeRecordingDetail')
  }, [setCurrentRealtimeRecordingId, setPage])

  const handleDeleteRecording = useCallback(async (id: string) => {
    await window.electronAPI.deleteRealtimeRecording(id)
    refreshRealtimeRecordings()
  }, [refreshRealtimeRecordings])

  const handleViewKnowledgeDoc = useCallback((doc: KnowledgeDoc) => {
    setCurrentKnowledgeDocId(doc.id)
    setPage('knowledgeDetail')
  }, [setCurrentKnowledgeDocId, setPage])

  const handleDeleteKnowledgeDoc = useCallback(async (docId: string) => {
    await window.electronAPI.deleteKnowledgeDoc(docId)
    refreshKnowledgeDocs()
  }, [refreshKnowledgeDocs])

  const handleDocCreated = useCallback(async (_docId: string) => {
    setCreateDocModalOpen(false)
    refreshKnowledgeDocs()
    setActiveTab('knowledge')
    const settings = await window.electronAPI.getSettings()
    await window.electronAPI.saveSettings({ ...settings, activeTab: 'knowledge' })
  }, [refreshKnowledgeDocs])

  return (
    <div
      style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24, minHeight: '100vh' }}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={3} style={{ margin: 0 }}>你说我记</Title>
        <Space>
          <Segmented
            value={themeMode}
            onChange={handleThemeChange}
            options={[
              { label: '默认', value: 'default', icon: <BgColorsOutlined /> },
              { label: '黑白', value: 'monochrome' },
            ]}
          />
          <Button type="text" icon={<SettingOutlined />} onClick={() => setSettingsOpen(true)} />
        </Space>
      </div>

      {addErrors.length > 0 && (
        <Alert type="error" message={addErrors.join('；')} closable onClose={() => setAddErrors([])} />
      )}

      <FeatureCards
        onUpload={handleAddFiles}
        onRecord={handleRecord}
        onCreateDoc={() => setCreateDocModalOpen(true)}
        streamingModelAvailable={streamingModelAvailable}
      />

      <Tabs activeKey={activeTab} onChange={handleTabChange}>
        <Tabs.TabPane tab="实时录音" key="realtime">
          <RealtimeRecordingTable
            recordings={realtimeRecordings}
            onView={handleViewRecording}
            onDelete={handleDeleteRecording}
            onRefresh={refreshRealtimeRecordings}
          />
        </Tabs.TabPane>
        <Tabs.TabPane tab="文件上传" key="upload">
          <TaskTable
            tasks={tasks}
            processingStartTime={processingStartTime}
            themeMode={themeMode}
            onViewDetail={handleViewDetail}
            onDelete={handleDelete}
            onRestart={handleRestart}
            onCancel={handleCancel}
            onExportAudio={handleExportAudio}
            onDeepAnalysis={handleDeepAnalysisFromList}
          />
        </Tabs.TabPane>
        <Tabs.TabPane tab="知识整理" key="knowledge">
          <KnowledgeTable
            docs={knowledgeDocs}
            templates={templates}
            themeMode={themeMode}
            onView={handleViewKnowledgeDoc}
            onDelete={handleDeleteKnowledgeDoc}
            onRefresh={refreshKnowledgeDocs}
            onCreateNew={() => setCreateDocModalOpen(true)}
          />
        </Tabs.TabPane>
      </Tabs>

      <CreateDocModal
        open={createDocModalOpen}
        onClose={() => setCreateDocModalOpen(false)}
        onCreated={handleDocCreated}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        availableModels={availableModels}
        onSettingsChange={handleSettingsChange}
      />
    </div>
  )
}
