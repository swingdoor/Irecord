## REMOVED Requirements

### Requirement: 浮动录音窗口
**Reason**: 浮动录音窗口原本服务于"快速唤起实时转写"场景，实时转写已移除，该窗口失去存在价值。
**Migration**: 录音统一走主窗口的 RecordingPage 全屏录音工作流（参见 recording-workflow 能力）。删除 floatingRecorder.ts、FloatingRecorderPage.tsx 及相关 IPC（start/stop-floating-recording、close-floating-recorder）。

### Requirement: 浮动窗口录音状态管理
**Reason**: 状态机（idle/floating/fullscreen/saving）的多模式区分仅为浮动窗口存在；移除浮动后只剩单一录音模式。
**Migration**: 主进程改用 audioRecorder 实例（!== null 即录音中）作为单一事实来源，删除独立状态枚举与 getRecordingState/setRecordingState/canStartRecording。
