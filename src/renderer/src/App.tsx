import { useAppStore } from './stores/appStore'
import TaskListPage from './pages/TaskListPage'
import TaskDetailPage from './pages/TaskDetailPage'

function App() {
  const page = useAppStore((state) => state.page)

  return (
    <div className="min-h-screen bg-gray-50">
      {page === 'taskList' && <TaskListPage />}
      {page === 'taskDetail' && <TaskDetailPage />}
    </div>
  )
}

export default App
