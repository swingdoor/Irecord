import { useAppStore } from './stores/appStore'
import TaskListPage from './pages/TaskListPage'
import TaskDetailPage from './pages/TaskDetailPage'

function App() {
  const page = useAppStore((state) => state.page)

  return (
    <>
      {page === 'taskList' && <TaskListPage />}
      {page === 'taskDetail' && <TaskDetailPage />}
    </>
  )
}

export default App
