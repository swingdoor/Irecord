## Context

当前 Irecord 应用的录音功能需要用户打开主窗口、导航到录音页面才能开始录音。这在需要快速捕捉内容时效率较低。用户希望通过全局快捷键在任何场景下立即开始录音，并通过浮动窗口查看录音状态和实时转写。

**现有架构:**
- 主进程: `src/main/index.ts` 创建单一主窗口
- 录音 IPC: `src/main/ipc/recordingHandlers.ts` 处理录音相关操作
- 录音页面: `src/renderer/src/pages/RecordingPage.tsx` 全屏录音界面
- 录音 Hook: `src/renderer/src/hooks/useRecording.ts` 封装录音逻辑
- 识别引擎: `RealtimeRecognizer` (Zipformer) 和 `Qwen3RealtimeRecognizer`

**约束:**
- Electron 应用，支持 Windows/Mac/Linux
- 快捷录音和全屏录音两种模式不能同时进行
- 浮动窗口需要始终置顶，不遮挡任务栏
- 录音数据保存到 SQLite 数据库 `realtime_recordings` 表

## Goals / Non-Goals

**Goals:**
- 实现全局快捷键触发录音（默认 `Ctrl+Shift+R`）
- 创建浮动录音窗口，显示状态、时长、实时转写
- 停止后原地弹出保存对话框，支持选择精校
- 与现有全屏录音功能共存，共享录音列表

**Non-Goals:**
- 快捷键自定义配置（后续迭代）
- 浮动窗口样式主题切换
- 多个浮动窗口同时录音
- 浮动窗口位置记忆（每次回到右上角）

## Decisions

### 1. 浮动窗口架构

**决策:** 创建独立的 BrowserWindow，使用 `alwaysOnTop: true`

**理由:**
- 独立窗口可以完全控制生命周期
- `alwaysOnTop` 确保录音状态始终可见
- `frame: false` + `transparent: true` 实现自定义 UI

**替代方案:**
- 使用主窗口的 overlay: 无法在主窗口最小化时显示
- 使用系统托盘: 无法显示实时转写文本

**实现细节:**
```typescript
new BrowserWindow({
  width: 400,
  height: 200,
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  skipTaskbar: true,
  resizable: false,
  movable: true,
  x: screen.getPrimaryDisplay().workArea.width - 420,
  y: 20
})
```

### 2. 全局快捷键管理

**决策:** 使用 Electron `globalShortcut` API，硬编码 `Ctrl+Shift+R`

**理由:**
- `globalShortcut` 是 Electron 官方 API，跨平台支持
- 硬编码简化初始实现，降低复杂度
- 快捷键冲突检测通过 `register` 返回值判断

**替代方案:**
- 使用 `electron-localshortcut`: 仅限应用内，不符合需求
- 使用第三方库 `node-global-key-listener`: 增加依赖复杂度

**冲突处理:**
- 注册失败时提示用户快捷键已被占用
- 不自动尝试其他快捷键（避免混淆）

### 3. 录音状态管理

**决策:** 主进程维护全局录音状态，防止多窗口冲突

**理由:**
- 浮动窗口和主窗口可能同时存在
- 主进程作为单一真相来源，避免状态不一致
- IPC handlers 检查状态，拒绝冲突的录音请求

**状态机:**
```
IDLE → FLOATING_RECORDING → IDLE
  ↓                           ↑
FULLSCREEN_RECORDING ─────────┘
```

**实现:**
```typescript
// src/main/windows/floatingRecorder.ts
let recordingState: 'idle' | 'floating' | 'fullscreen' = 'idle'

export function canStartRecording(mode: 'floating' | 'fullscreen'): boolean {
  return recordingState === 'idle'
}
```

### 4. 浮动窗口与保存对话框的过渡

**决策:** 浮动窗口原地变形为保存对话框

**理由:**
- 视觉连续性好，用户体验流畅
- 避免多窗口管理复杂度
- 保持窗口位置，减少视线移动

**实现方式:**
- 录音页面和保存对话框在同一个 HTML 页面
- 通过 React 状态切换显示内容
- 窗口尺寸保持不变（400x200）

### 5. 实时转写显示

**决策:** 复用现有 `RealtimeTranscript` 组件，限制高度并滚动

**理由:**
- 避免重复开发，保持 UI 一致性
- 现有组件已支持自动滚动和时间戳显示
- 通过 CSS 限制高度适配浮动窗口

**样式调整:**
```css
.floating-transcript {
  max-height: 120px;
  overflow-y: auto;
  font-size: 12px;
}
```

## Risks / Trade-offs

**[风险] 快捷键冲突**
- **影响:** 用户系统中其他应用已占用 `Ctrl+Shift+R`
- **缓解:** 注册时检测冲突，提示用户；后续版本支持自定义

**[风险] 浮动窗口遮挡内容**
- **影响:** 始终置顶可能遮挡用户正在操作的内容
- **缓解:** 窗口可拖动；默认位置在右上角，通常不遮挡主要内容

**[风险] 多窗口状态同步**
- **影响:** 浮动窗口录音时，主窗口可能尝试开始全屏录音
- **缓解:** 主进程维护全局状态，IPC handlers 检查并拒绝冲突请求

**[权衡] 窗口位置不记忆**
- **决策:** 每次启动回到右上角
- **理由:** 简化实现，避免跨屏幕场景下的位置错误
- **影响:** 用户每次需要重新拖动（如果需要）

**[权衡] 快捷键硬编码**
- **决策:** 不支持自定义
- **理由:** 降低初始复杂度，快速交付核心功能
- **影响:** 部分用户可能遇到快捷键冲突

**[风险] 浮动窗口在保存对话框时被关闭**
- **影响:** 用户可能误关闭窗口导致录音丢失
- **缓解:** 监听窗口关闭事件，弹出确认对话框
