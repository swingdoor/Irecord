## REMOVED Requirements

### Requirement: 全局快捷键唤起录音
**Reason**: 全局快捷键（CommandOrControl+Shift+R）原本用于快速唤起浮动录音/实时转写，浮动录音与实时转写均已移除，快捷键失去意义。
**Migration**: 录音从主窗口录音卡片进入。删除 globalShortcuts.ts、index.ts 中的 registerRecordingShortcut/unregisterRecordingShortcut 调用，以及 onShortcutStopRecording preload 接口。
