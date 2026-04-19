import { useEffect, useCallback, useState } from 'react'
import { Plus, FileAudio, Trash2, Loader2, CheckCircle, XCircle, Clock } from 'lucide-react'
import { useAppStore, Task } from '../stores/appStore'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function ProcessingTimer({ createdAt }: { createdAt: string }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const start = new Date(createdAt).getTime()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [createdAt])
  return <span>{formatDuration(elapsed)}</span>
}

export default function TaskListPage() {
  const { tasks, refreshTasks, setPage, setCurrentTaskId } = useAppStore()

  useEffect(() => {
    refreshTasks()
    const unsub = window.electronAPI.onTaskStatusChanged(() => refreshTasks())
    return () => { unsub() }
  }, [refreshTasks])

  const handleAddFiles = useCallback(async () => {
    await window.electronAPI.addFiles()
    refreshTasks()
  }, [refreshTasks])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) {
      await window.electronAPI.addDroppedFiles(files.map(f => f.path))
      refreshTasks()
    }
  }, [refreshTasks])

  const handleDelete = useCallback(async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation()
    await window.electronAPI.deleteTask(taskId)
    refreshTasks()
  }, [refreshTasks])

  const handleViewDetail = useCallback((task: Task) => {
    if (task.status !== 'completed') return
    setCurrentTaskId(task.id)
    setPage('taskDetail')
  }, [setCurrentTaskId, setPage])

  const active = tasks.filter(t => t.status === 'pending' || t.status === 'processing')
  const completed = tasks.filter(t => t.status === 'completed')
  const failed = tasks.filter(t => t.status === 'failed')

  return (
    <div className="min-h-screen flex flex-col p-6" onDragOver={e => e.preventDefault()} onDrop={handleDrop}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-800">语音转写助手</h1>
        <button onClick={handleAddFiles} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
          <Plus className="w-4 h-4" />添加文件
        </button>
      </div>

      {tasks.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
          <FileAudio className="w-16 h-16 mb-4" />
          <p className="text-lg mb-2">暂无任务</p>
          <p className="text-sm">点击"添加文件"或拖放音频/视频文件开始</p>
        </div>
      )}

      {active.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-gray-500 mb-3">进行中</h2>
          <div className="space-y-2">
            {active.map(task => (
              <div key={task.id} className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                {task.status === 'processing'
                  ? <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
                  : <Clock className="w-5 h-5 text-gray-400 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{task.fileName}</p>
                  <p className="text-xs text-gray-500">
                    {task.status === 'processing'
                      ? <>语音识别中 · <ProcessingTimer createdAt={task.createdAt} /></>
                      : '排队中'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {completed.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-medium text-gray-500 mb-3">已完成</h2>
          <div className="space-y-2">
            {completed.map(task => (
              <div key={task.id} onClick={() => handleViewDetail(task)} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{task.fileName}</p>
                  <p className="text-xs text-gray-500">
                    {task.wordCount ? `${task.wordCount} 字` : ''}
                    {task.processingTime ? ` · 耗时 ${formatDuration(task.processingTime)}` : ''}
                    {task.completedAt ? ` · ${formatDate(task.completedAt)}` : ''}
                  </p>
                </div>
                <button onClick={e => handleDelete(e, task.id)} className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {failed.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-gray-500 mb-3">失败</h2>
          <div className="space-y-2">
            {failed.map(task => (
              <div key={task.id} className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{task.fileName}</p>
                  <p className="text-xs text-red-600 truncate">{task.error || '未知错误'}</p>
                </div>
                <button onClick={e => handleDelete(e, task.id)} className="p-1 text-gray-300 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
