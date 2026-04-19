import { useState, useEffect } from 'react'
import { ConfigProvider } from 'antd'
import { useAppStore } from './stores/appStore'
import TaskListPage from './pages/TaskListPage'
import TaskDetailPage from './pages/TaskDetailPage'

function App() {
  const page = useAppStore((state) => state.page)
  const [themeMode, setThemeMode] = useState<'default' | 'monochrome'>('default')

  useEffect(() => {
    window.electronAPI.getSettings().then(settings => {
      setThemeMode(settings.themeMode || 'default')
    })
  }, [])

  const monochromeTheme = {
    token: {
      colorPrimary: '#18181b',
      colorInfo: '#18181b',
      colorSuccess: '#18181b',
      colorWarning: '#71717a',
      colorError: '#18181b',
      colorTextBase: '#09090b',
      colorBgBase: '#ffffff',
      colorBorder: '#e4e4e7',
      colorBorderSecondary: '#f4f4f5',
      borderRadius: 6,
      fontSize: 14,
    },
    components: {
      Button: {
        colorBorder: '#e4e4e7',
        colorText: '#18181b',
        primaryShadow: 'none',
        defaultShadow: 'none',
      },
      Input: {
        colorBorder: '#e4e4e7',
        activeBorderColor: '#18181b',
        hoverBorderColor: '#a1a1aa',
      },
      Select: {
        colorBorder: '#e4e4e7',
        colorPrimaryHover: '#27272a',
      },
      Card: {
        colorBorderSecondary: '#e4e4e7',
      },
      Table: {
        colorBorderSecondary: '#e4e4e7',
        headerBg: '#fafafa',
      },
      Tag: {
        defaultBg: '#f4f4f5',
        defaultColor: '#52525b',
      },
    },
  }

  const themeConfig = themeMode === 'monochrome' ? monochromeTheme : {}

  return (
    <ConfigProvider theme={themeConfig}>
      {page === 'taskList' && <TaskListPage themeMode={themeMode} onThemeChange={setThemeMode} />}
      {page === 'taskDetail' && <TaskDetailPage />}
    </ConfigProvider>
  )
}

export default App
