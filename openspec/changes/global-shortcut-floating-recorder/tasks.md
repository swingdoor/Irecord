## 1. 全局快捷键管理

- [x] 1.1 创建 `src/main/shortcuts/globalShortcuts.ts` 模块，封装全局快捷键注册逻辑
- [x] 1.2 实现 `registerRecordingShortcut()` 函数，注册 `Ctrl+Shift+R` 快捷键
- [x] 1.3 实现快捷键冲突检测，注册失败时返回错误信息
- [x] 1.4 在 `src/main/index.ts` 的 `app.whenReady()` 中调用快捷键注册
- [x] 1.5 在 `app.on('will-quit')` 中注销全局快捷键

## 2. 录音状态管理

- [x] 2.1 在 `src/main/windows/floatingRecorder.ts` 中创建全局录音状态变量
- [x] 2.2 实现 `canStartRecording(mode)` 函数，检查是否可以开始录音
- [x] 2.3 实现 `setRecordingState(state)` 函数，更新全局录音状态
- [x] 2.4 修改 `src/main/ipc/recordingHandlers.ts` 的 `start-recording` handler，检查状态冲突
- [x] 2.5 在录音开始和结束时更新全局状态

## 3. 浮动录音窗口创建

- [x] 3.1 创建 `src/main/windows/floatingRecorder.ts` 模块
- [x] 3.2 实现 `createFloatingRecorderWindow()` 函数，创建浮动窗口 BrowserWindow
- [x] 3.3 配置窗口属性：`alwaysOnTop`, `frame: false`, `transparent: true`, `skipTaskbar: true`
- [x] 3.4 计算窗口初始位置（屏幕右上角，距离边缘 20px）
- [x] 3.5 加载浮动录音页面路由（`#/floating-recorder`）
- [x] 3.6 实现 `showFloatingRecorder()` 和 `hideFloatingRecorder()` 函数

## 4. 浮动录音页面 UI

- [x] 4.1 创建 `src/renderer/src/pages/FloatingRecorderPage.tsx` 页面组件
- [x] 4.2 实现录音状态显示：录音图标、时长计时器
- [x] 4.3 集成 `WaveformVisualizer` 组件（调整尺寸适配浮动窗口）
- [x] 4.4 集成 `RealtimeTranscript` 组件，限制高度 120px，支持滚动
- [x] 4.5 实现控制按钮：暂停/继续、停止
- [x] 4.6 实现窗口拖动功能（通过顶部栏 `-webkit-app-region: drag`）
- [x] 4.7 添加浮动窗口样式（圆角、阴影、半透明背景）

## 5. 浮动录音逻辑

- [x] 5.1 在 `FloatingRecorderPage` 中使用 `useRecording` hook
- [x] 5.2 实现自动开始录音（页面加载后立即调用 `start()`）
- [x] 5.3 实现暂停/继续按钮点击处理
- [x] 5.4 实现停止按钮点击处理，切换到保存对话框模式
- [x] 5.5 监听全局快捷键触发的停止事件（通过 IPC）

## 6. 保存对话框组件

- [x] 6.1 创建 `src/renderer/src/components/RecordingSaveDialog.tsx` 组件
- [x] 6.2 显示录音完成信息：时长、字数
- [x] 6.3 实现"创建精校任务"复选框
- [x] 6.4 实现"保存"按钮，调用 `saveRealtimeRecording` IPC
- [x] 6.5 实现"丢弃"按钮，关闭浮动窗口不保存
- [x] 6.6 保存成功后关闭浮动窗口，重置录音状态

## 7. 浮动录音 IPC 通信

- [x] 7.1 在 `src/main/ipc/recordingHandlers.ts` 中添加 `start-floating-recording` handler
- [x] 7.2 添加 `stop-floating-recording` handler，返回录音结果
- [x] 7.3 在 `src/preload/index.ts` 中暴露浮动录音相关 API
- [x] 7.4 实现主进程向浮动窗口发送停止事件（快捷键触发）
- [x] 7.5 实现浮动窗口关闭前的确认对话框（录音进行中或保存对话框显示时）

## 8. 路由和状态集成

- [x] 8.1 在 `src/renderer/src/App.tsx` 中添加 `/floating-recorder` 路由
- [x] 8.2 在 `FloatingRecorderPage` 中管理页面状态（录音中 / 保存对话框）
- [x] 8.3 确保浮动录音保存到 `realtime_recordings` 表（复用现有逻辑）
- [x] 8.4 验证保存的录音在 `RealtimeRecordingTable` 中正确显示

## 9. 快捷键与窗口联动

- [x] 9.1 在 `globalShortcuts.ts` 中实现快捷键回调，检查当前状态
- [x] 9.2 空闲状态按快捷键：创建并显示浮动窗口，开始录音
- [x] 9.3 录音中按快捷键：停止录音，切换到保存对话框
- [x] 9.4 保存对话框显示时按快捷键：忽略
- [x] 9.5 全屏录音进行中按快捷键：忽略

## 10. 错误处理和边界情况

- [x] 10.1 快捷键注册失败时，在主窗口显示通知
- [x] 10.2 浮动窗口创建失败时，回退到全屏录音模式
- [x] 10.3 录音过程中浮动窗口意外关闭，清理录音状态
- [x] 10.4 保存失败时，在浮动窗口显示错误提示，保留对话框
- [x] 10.5 音频设备权限被拒绝时，显示权限请求提示

## 11. 测试和验证

- [ ] 11.1 测试快捷键在不同应用场景下的触发（主窗口最小化、其他应用前台）
- [ ] 11.2 测试浮动窗口拖动和置顶行为
- [ ] 11.3 测试录音暂停/继续/停止功能
- [ ] 11.4 测试保存对话框的保存和丢弃操作
- [ ] 11.5 测试浮动录音和全屏录音的互斥逻辑
- [ ] 11.6 测试保存的录音在列表中的显示和播放
- [ ] 11.7 测试精校任务创建功能