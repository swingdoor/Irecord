import { useAppStore } from './stores/appStore'
import UploadPage from './pages/UploadPage'
import ProcessingPage from './pages/ProcessingPage'
import ResultPage from './pages/ResultPage'

function App() {
  const page = useAppStore((state) => state.page)

  return (
    <div className="min-h-screen bg-gray-50">
      {page === 'upload' && <UploadPage />}
      {page === 'processing' && <ProcessingPage />}
      {page === 'result' && <ResultPage />}
    </div>
  )
}

export default App
