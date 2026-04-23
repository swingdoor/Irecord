## Why

用户需要在任何场景下快速开始录音，而不必切换到应用主窗口。当前的录音功能需要打开应用、导航到录音页面才能开始，这在需要快速捕捉内容时效率较低。全局快捷键 + 浮动窗口的方式可以让用户在任何时候立即开始录音，提升使用体验。

## What Changes

- 新增全局快捷键 `Ctrl+Shift+R`，可在任何场景下触发录音
- 新增浮动录音窗口，始终置顶显示录音状态、时长和实时转写文本
- 浮动窗口支持暂停/继续/停止控制
- 停止录音后浮动窗口原地变形为保存对话框，支持选择是否创建精校任务
- 快捷录音和全屏录音两种模式独立运行，但共享同一个录音列表
- 浮动窗口默认显示在屏幕右上角，可拖动，每次启动回到默认位置

## Capabilities

### New Capabilities
- `global-shortcut-recording`: 全局快捷键注册、录音状态管理、快捷键冲突检测
- `floating-recorder-window`: 浮动窗口创建、置顶、拖动、状态显示、实时转写展示
- `recording-save-dialog`: 停止后保存对话框、精校任务选项、保存/丢弃操作

### Modified Capabilities
<!-- 无现有能力需要修改，快捷录音作为独立功能添加 -->

## Impact

**新增文件:**
- `src/main/windows/floatingRecorder.ts` - 浮动窗口管理
- `src/main/shortcuts/globalShortcuts.ts` - 全局快捷键管理
- `src/renderer/src/pages/FloatingRecorderPage.tsx` - 浮动窗口页面
- `src/renderer/src/components/RecordingSaveDialog.tsx` - 保存对话框组件

**修改文件:**
- `src/main/index.ts` - 注册全局快捷键，初始化浮动窗口管理器
- `src/main/ipc/recordingHandlers.ts` - 扩展 IPC handlers 支持浮动录音
- `src/preload/index.ts` - 暴露浮动录音相关 API

**依赖:**
- 复用现有的 `useRecording` hook
- 复用现有的 `WaveformVisualizer` 和 `RealtimeTranscript` 组件
- 复用现有的 `saveRealtimeRecording` IPC handler

**用户体验影响:**
- 新增快捷键可能与其他应用冲突（需要检测和提示）
- 浮动窗口始终置顶可能遮挡其他内容（但可拖动）
- 两种录音模式互斥（同时只能有一个录音进行）
