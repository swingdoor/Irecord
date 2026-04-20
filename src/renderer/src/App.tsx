import { useState, useEffect } from 'react'
import { ConfigProvider, Modal } from 'antd'
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

    window.electronAPI.checkResources().then(({ ffmpegExists, hasAnyModel }) => {
      if (!ffmpegExists || !hasAnyModel) {
        const missing = [
          !ffmpegExists ? 'FFmpeg' : null,
          !hasAnyModel ? '至少一个模型' : null,
        ].filter(Boolean).join(' 和 ')

        Modal.warning({
          title: '缺少必要资源',
          content: `当前未检测到${missing}。请先在设置中配置 FFmpeg 文件夹和模型文件夹路径，否则无法正常转写。`,
          okText: '知道了',
        })
      }
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
      colorTextLightSolid: '#ffffff',
      borderRadius: 6,
      fontSize: 14,
    },
    components: {
      Button: {
        colorBorder: '#e4e4e7',
        colorText: '#18181b',
        primaryColor: '#ffffff',
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
        optionSelectedColor: '#ffffff',
        optionSelectedBg: '#18181b',
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
      Alert: {
        colorErrorBg: '#fef2f2',
        colorErrorBorder: '#fecaca',
        colorErrorText: '#991b1b',
        colorWarningBg: '#fffbeb',
        colorWarningBorder: '#fde68a',
        colorWarningText: '#92400e',
        colorInfoBg: '#f0f9ff',
        colorInfoBorder: '#bae6fd',
        colorInfoText: '#075985',
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
