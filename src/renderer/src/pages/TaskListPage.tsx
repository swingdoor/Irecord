import { useEffect, useCallback, useState } from 'react'
import { Typography, Alert, Button, Segmented, Space } from 'antd'
import { BgColorsOutlined, SettingOutlined } from '@ant-design/icons'
import { useAppStore, Task } from '../stores/appStore'
import { FeatureCards } from '../components/FeatureCards'
import { TaskTable } from '../components/TaskTable'
import { SettingsModal } from '../components/SettingsModal'

const { Title } = Typography

interface TaskListPageProps {
  themeMode: 'default' | 'monochrome'
  onThemeChange: (mode: 'default' | 'monochrome') => void
}

export default function TaskListPage({ themeMode, onThemeChange }: TaskListPageProps) {
  const { tasks, refreshTasks, setPage, setCurrentTaskId } = useAppStore()
  const [processingStartTime, setProcessingStartTime] = useState(Date.now())
  const [selectedModel, setSelectedModel] = useState('qwen3-asr')
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; available: boolean }>>([])
  const [addErrors, setAddErrors] = useState<string[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    refreshTasks()
    Promise.all([
      window.electronAPI.getAvailableModels(),
      window.electronAPI.getSettings(),
    ]).then(([models, settings]) => {
      setAvailableModels(models)
      const defaultModel = settings.defaultModel || models.find(m => m.available)?.id || 'qwen3-asr'
      setSelectedModel(defaultModel)
    })
    window.electronAPI.getCurrentTaskInfo().then(info => {
      if (info.startTime) setProcessingStartTime(info.startTime)
    })
    const unsub = window.electronAPI.onTaskStatusChanged((data) => {
      if (data.startTime) setProcessingStartTime(data.startTime)
      refreshTasks()
    })
    return () => { unsub() }
  }, [refreshTasks])

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
    const result = await window.electronAPI.addFiles(selectedModel)
    if (result.errors?.length) setAddErrors(result.errors)
    refreshTasks()
  }, [refreshTasks, selectedModel])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setAddErrors([])
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
    if (task.status !== 'completed') return
    setCurrentTaskId(task.id)
    setPage('taskDetail')
  }, [setCurrentTaskId, setPage])

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

      <FeatureCards onUpload={handleAddFiles} />

      <TaskTable
        tasks={tasks}
        processingStartTime={processingStartTime}
        themeMode={themeMode}
        onViewDetail={handleViewDetail}
        onDelete={handleDelete}
        onRestart={handleRestart}
        onCancel={handleCancel}
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
