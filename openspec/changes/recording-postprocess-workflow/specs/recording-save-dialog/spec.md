## REMOVED Requirements

### Requirement: 浮动录音保存对话框
**Reason**: RecordingSaveDialog 是浮动录音窗口专用的保存表单组件，浮动窗口移除后该组件无消费者。
**Migration**: 保存逻辑（调用 saveRealtimeRecording）已在 RecordingPage 完成阶段实现等价功能，无需迁移组件本身。删除 RecordingSaveDialog.tsx、onRequestCloseConfirmation/closeFloatingRecorder preload 接口。
