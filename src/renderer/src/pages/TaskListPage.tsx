import { useEffect, useCallback, useState, useMemo } from 'react'
import { Typography, Alert, Button, Segmented, Space, Modal, Tabs, Input, Dropdown, message } from 'antd'
import { BgColorsOutlined, SettingOutlined, SearchOutlined } from '@ant-design/icons'
import { useAppStore, Task, RealtimeRecording, KnowledgeDoc } from '../stores/appStore'
import { FeatureCards } from '../components/FeatureCards'
import { TaskTable } from '../components/TaskTable'
import { RealtimeRecordingTable } from '../components/RealtimeRecordingTable'
import { KnowledgeTable } from '../components/KnowledgeTable'
import { CreateDocModal } from '../components/CreateDocModal'
import { SettingsModal } from '../components/SettingsModal'
import { TemplateManagerModal } from '../components/TemplateManagerModal'

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
    setPage, setCurrentTaskId, setCurrentRealtimeRecordingId, setCurrentKnowledgeDocId,
    activeTab, setActiveTab
  } = useAppStore()
  const [processingStartTime, setProcessingStartTime] = useState(Date.now())
  const [selectedModel, setSelectedModel] = useState('qwen3-asr')
  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; available: boolean }>>([])
  const [addErrors, setAddErrors] = useState<string[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [createDocModalOpen, setCreateDocModalOpen] = useState(false)
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [taskProgress, setTaskProgress] = useState<Record<string, { stage: string; percent: number }>>({})
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table')
  const [searchTerm, setSearchTerm] = useState('')

  // 三个 tab 的选中状态
  const [selectedRealtimeRecordings, setSelectedRealtimeRecordings] = useState<string[]>([])
  const [selectedTasks, setSelectedTasks] = useState<string[]>([])
  const [selectedKnowledgeDocs, setSelectedKnowledgeDocs] = useState<string[]>([])

  // 当前 tab 的选中数据
  const currentSelectedKeys = useMemo(() => {
    if (activeTab === 'realtime') return selectedRealtimeRecordings
    if (activeTab === 'upload') return selectedTasks
    return selectedKnowledgeDocs
  }, [activeTab, selectedRealtimeRecordings, selectedTasks, selectedKnowledgeDocs])

  const setCurrentSelectedKeys = useCallback((keys: string[]) => {
    if (activeTab === 'realtime') setSelectedRealtimeRecordings(keys)
    else if (activeTab === 'upload') setSelectedTasks(keys)
    else setSelectedKnowledgeDocs(keys)
  }, [activeTab])

  // 根据当前 tab 和搜索词过滤数据
  const currentData = useMemo(() => {
    let allData: any[] = []

    if (activeTab === 'realtime') {
      allData = realtimeRecordings
    } else if (activeTab === 'upload') {
      allData = tasks.filter(t => t.source !== 'recording')
    } else if (activeTab === 'knowledge') {
      allData = knowledgeDocs
    }

    if (!searchTerm) return allData

    const term = searchTerm.toLowerCase()
    if (activeTab === 'realtime') {
      return allData.filter((r: RealtimeRecording) => r.title.toLowerCase().includes(term))
    } else if (activeTab === 'upload') {
      return allData.filter((t: Task) => t.fileName.toLowerCase().includes(term))
    } else if (activeTab === 'knowledge') {
      return allData.filter((d: KnowledgeDoc) => d.title.toLowerCase().includes(term))
    }
    return allData
  }, [activeTab, realtimeRecordings, tasks, knowledgeDocs, searchTerm])

  useEffect(() => {
    refreshTasks()
    refreshRealtimeRecordings()
    refreshKnowledgeDocs()
    refreshTemplates()
    Promise.all([
      window.electronAPI.getAvailableModels(),
      window.electronAPI.getSettings(),
    ]).then(([models, settings]) => {
      setAvailableModels(models)
      const defaultModel = settings.defaultModel || models.find(m => m.available)?.id || 'qwen3-asr'
      setSelectedModel(defaultModel)
      // Restore active tab from settings
      if (settings.activeTab) setActiveTab(settings.activeTab)
    })
    window.electronAPI.getCurrentTaskInfo().then(info => {
      if (info.startTime) setProcessingStartTime(info.startTime)
    })
    const unsub = window.electronAPI.onTaskStatusChanged((data) => {
      if (data.startTime) setProcessingStartTime(data.startTime)
      refreshTasks()
      // 清理已完成任务的进度
      if (data.taskId) {
        setTaskProgress(prev => {
          const next = { ...prev }
          delete next[data.taskId]
          return next
        })
      }
    })
    const unsubProgress = window.electronAPI.onTaskProgress((data) => {
      setTaskProgress(prev => ({ ...prev, [data.taskId]: { stage: data.stage, percent: data.percent } }))
    })
    return () => { unsub(); unsubProgress() }
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
    if (result.tasks?.length > 0) {
      setActiveTab('upload')
      const settings = await window.electronAPI.getSettings()
      await window.electronAPI.saveSettings({ ...settings, activeTab: 'upload' })
    }
    refreshTasks()
  }, [refreshTasks, selectedModel, setActiveTab])

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
      if (result.tasks?.length > 0) {
        setActiveTab('upload')
        const settings = await window.electronAPI.getSettings()
        await window.electronAPI.saveSettings({ ...settings, activeTab: 'upload' })
      }
      refreshTasks()
    }
  }, [refreshTasks, selectedModel, setActiveTab])

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
    setSearchTerm('') // 切换 tab 清空搜索
    const settings = await window.electronAPI.getSettings()
    await window.electronAPI.saveSettings({ ...settings, activeTab: key })
  }, [])

  const handleViewRecording = useCallback((recording: RealtimeRecording) => {
    setCurrentRealtimeRecordingId(recording.id)
    setPage('realtimeRecordingDetail')
  }, [setCurrentRealtimeRecordingId, setPage])

  const handleViewTranscription = useCallback((taskId: string) => {
    setCurrentTaskId(taskId)
    setPage('taskDetail')
  }, [setCurrentTaskId, setPage])

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

  // 批量删除
  const handleBatchDelete = useCallback(() => {
    if (currentSelectedKeys.length === 0) return

    const itemName = activeTab === 'realtime' ? '录音' : activeTab === 'upload' ? '任务' : '文档'

    Modal.confirm({
      title: `确定删除选中的 ${currentSelectedKeys.length} 个${itemName}？`,
      content: '删除后无法恢复',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        if (activeTab === 'realtime') {
          for (const id of currentSelectedKeys) {
            await window.electronAPI.deleteRealtimeRecording(id)
          }
          refreshRealtimeRecordings()
          setSelectedRealtimeRecordings([])
        } else if (activeTab === 'upload') {
          for (const id of currentSelectedKeys) {
            await window.electronAPI.deleteTask(id)
          }
          refreshTasks()
          setSelectedTasks([])
        } else {
          for (const id of currentSelectedKeys) {
            await window.electronAPI.deleteKnowledgeDoc(id)
          }
          refreshKnowledgeDocs()
          setSelectedKnowledgeDocs([])
        }
        message.success(`已删除 ${currentSelectedKeys.length} 个${itemName}`)
      }
    })
  }, [currentSelectedKeys, activeTab, refreshRealtimeRecordings, refreshTasks, refreshKnowledgeDocs])

  // 批量导出
  const handleBatchExport = useCallback(async (format: 'wav' | 'txt' | 'md' | 'pdf') => {
    if (currentSelectedKeys.length === 0) return

    if (activeTab === 'realtime' && format === 'wav') {
      const result = await window.electronAPI.batchExportRecordingWav(currentSelectedKeys)
      if (result.error) {
        message.error(result.error)
      } else if (!result.canceled) {
        if (result.failed === 0) {
          message.success(`已导出 ${result.success} 个文件到 ${result.targetDir}`)
        } else {
          message.warning(`已导出 ${result.success} 个文件，${result.failed} 个失败`)
        }
      }
      setSelectedRealtimeRecordings([])
    } else if (activeTab === 'upload' && format === 'txt') {
      const result = await window.electronAPI.batchExportTaskTxt(currentSelectedKeys)
      if (result.error) {
        message.error(result.error)
      } else if (!result.canceled) {
        if (result.failed === 0) {
          message.success(`已导出 ${result.success} 个文件到 ${result.targetDir}`)
        } else {
          message.warning(`已导出 ${result.success} 个文件，${result.failed} 个失败`)
        }
      }
      setSelectedTasks([])
    } else if (activeTab === 'knowledge' && (format === 'md' || format === 'txt' || format === 'pdf')) {
      const result = await window.electronAPI.batchExportKnowledge({
        docIds: currentSelectedKeys,
        format
      })
      if (result.error) {
        message.error(result.error)
      } else if (!result.canceled) {
        if (result.failed === 0) {
          message.success(`已导出 ${result.success} 个文件到 ${result.targetDir}`)
        } else {
          message.warning(`已导出 ${result.success} 个文件，${result.failed} 个失败`)
        }
      }
      setSelectedKnowledgeDocs([])
    }
  }, [currentSelectedKeys, activeTab])

  return (
    <div
      style={{
        height: 'calc(100vh - 30px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      onDragOver={e => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Header 固定 */}
      <div style={{ padding: '24px 24px 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
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
          <Alert type="error" message={addErrors.join('；')} closable onClose={() => setAddErrors([])} style={{ marginBottom: 16 }} />
        )}

        <FeatureCards
          onUpload={handleAddFiles}
          onRecord={handleRecord}
          onCreateDoc={() => setCreateDocModalOpen(true)}
          onManageTemplates={() => setTemplateModalOpen(true)}
        />
      </div>

      {/* Tabs + 内容区。搜索 + 视图切换通过 tabBarExtraContent 与 Tab 栏同行 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 24px 24px', overflow: 'hidden', minHeight: 0 }}>
        <Tabs
          activeKey={activeTab}
          onChange={handleTabChange}
          className="list-page-tabs"
          style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', minHeight: 0 }}
          tabBarExtraContent={
            <Space>
              {currentSelectedKeys.length > 0 && (
                <>
                  <Button danger size="small" onClick={handleBatchDelete}>
                    删除 ({currentSelectedKeys.length})
                  </Button>
                  {activeTab === 'realtime' && (
                    <Button size="small" onClick={() => handleBatchExport('wav')}>
                      导出音频
                    </Button>
                  )}
                  {activeTab === 'upload' && (
                    <Button size="small" onClick={() => handleBatchExport('txt')}>
                      导出 TXT
                    </Button>
                  )}
                  {activeTab === 'knowledge' && (
                    <Dropdown
                      menu={{
                        items: [
                          { key: 'md', label: '导出为 Markdown' },
                          { key: 'txt', label: '导出为 TXT' },
                          { key: 'pdf', label: '导出为 PDF' },
                        ],
                        onClick: ({ key }) => handleBatchExport(key as 'md' | 'txt' | 'pdf')
                      }}
                      trigger={['click']}
                    >
                      <Button size="small">导出</Button>
                    </Dropdown>
                  )}
                </>
              )}
              <Input
                placeholder={`搜索${activeTab === 'realtime' ? '录音' : activeTab === 'upload' ? '文件' : '文档'}...`}
                prefix={<SearchOutlined />}
                value={searchTerm}
                onChange={e => {
                  setSearchTerm(e.target.value)
                }}
                allowClear
                style={{ width: currentSelectedKeys.length > 0 ? 180 : 240 }}
              />
              <Segmented
                value={viewMode}
                onChange={v => {
                  setViewMode(v as 'table' | 'card')
                }}
                options={[
                  { label: '列表', value: 'table' },
                  { label: '卡片', value: 'card' },
                ]}
              />
            </Space>
          }
          items={[
            {
              key: 'realtime',
              label: '实时录音',
              children: (
                <RealtimeRecordingTable
                  recordings={currentData}
                  tasks={tasks}
                  themeMode={themeMode}
                  processingStartTime={processingStartTime}
                  taskProgress={taskProgress}
                  viewMode={viewMode}
                  selectedRowKeys={selectedRealtimeRecordings}
                  onSelectedRowKeysChange={setSelectedRealtimeRecordings}
                  onView={handleViewRecording}
                  onViewTranscription={handleViewTranscription}
                  onDelete={handleDeleteRecording}
                  onRefresh={refreshRealtimeRecordings}
                />
              ),
            },
            {
              key: 'upload',
              label: '文件上传',
              children: (
                <TaskTable
                  tasks={currentData}
                  processingStartTime={processingStartTime}
                  taskProgress={taskProgress}
                  themeMode={themeMode}
                  viewMode={viewMode}
                  selectedRowKeys={selectedTasks}
                  onSelectedRowKeysChange={setSelectedTasks}
                  onViewDetail={handleViewDetail}
                  onDelete={handleDelete}
                  onRestart={handleRestart}
                  onCancel={handleCancel}
                  onExportAudio={handleExportAudio}
                  onDeepAnalysis={handleDeepAnalysisFromList}
                />
              ),
            },
            {
              key: 'knowledge',
              label: '知识整理',
              children: (
                <KnowledgeTable
                  docs={currentData}
                  templates={templates}
                  themeMode={themeMode}
                  viewMode={viewMode}
                  selectedRowKeys={selectedKnowledgeDocs}
                  onSelectedRowKeysChange={setSelectedKnowledgeDocs}
                  onView={handleViewKnowledgeDoc}
                  onDelete={handleDeleteKnowledgeDoc}
                  onRefresh={refreshKnowledgeDocs}
                />
              ),
            },
          ]}
        />
      </div>

      <style>{`
        .list-page-tabs.ant-tabs {
          display: flex !important;
          flex-direction: column !important;
          height: 100% !important;
        }
        .list-page-tabs .ant-tabs-nav {
          flex-shrink: 0 !important;
        }
        .list-page-tabs .ant-tabs-content-holder {
          flex: 1 !important;
          overflow: hidden !important;
          min-height: 0 !important;
        }
        .list-page-tabs .ant-tabs-content {
          height: 100% !important;
        }
        .list-page-tabs .ant-tabs-tabpane {
          height: 100% !important;
          overflow: hidden !important;
        }
      `}</style>

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

      <TemplateManagerModal
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
      />
    </div>
  )
}
