> ⚠️ **已废弃（DEPRECATED 2026-06-10）**：本 change 的**后处理流水线 / 录音页四阶段工作流 / A-B 对比试听 / 双文件转写契约 / 停止后用户主动触发后处理**等设计已被 [`unify-recording-transcription`](../unify-recording-transcription/proposal.md) 取代，**不再参照**。评估结论：后处理（压缩/降噪/裁剪静音/响度归一）效果不佳且不实用，复杂度不值。
>
> 本 change 中**与后处理无关**的部分——「浮动录音窗口/全局快捷键删除」「实时引擎残留清理」——属于独立收尾成果，已落地且**予以保留**，不被 `unify-recording-transcription` 回滚。
>
> 后续录音/转写相关设计请以 `unify-recording-transcription` 为准。

## Why

上一个 change（`remove-realtime-transcription`）移除了实时转写并新增了后处理流水线，但实施时发现三个遗留问题：(1) 后处理 UI 被错误地加到了未被引用的死代码 `RecordingModal.tsx`，真正使用的 `RecordingPage.tsx` 完全没有后处理界面；(2) 浮动录音窗口与全局快捷键功能因实时转写移除而失去意义，但相关代码（`floatingRecorder.ts`、`globalShortcuts.ts`、`FloatingRecorderPage.tsx`）仍然残留；(3) 实时引擎定义在 `engines.ts`/`registry.ts` 中未清理，导致模型管理页仍显示"实时转写模型"分组。本 change 收口这些遗留，并把录音页重构成一条完整的"录音 → 后处理 → A/B 对比试听 → 保存"四阶段工作流。

## What Changes

- **BREAKING**：移除浮动录音窗口与全局快捷键功能。删除 `floatingRecorder.ts`、`globalShortcuts.ts`、`FloatingRecorderPage.tsx`、`RecordingSaveDialog.tsx`，删除 `start/stop-floating-recording`、`close-floating-recorder` IPC，删除 `onShortcutStopRecording`/`onRequestCloseConfirmation`/`closeFloatingRecorder` preload 接口，删除 App.tsx 的浮动路由分支。
- **BREAKING**：删除死代码 `RecordingModal.tsx`（功能合并到 `RecordingPage`）。
- 录音状态机简化：删除 `floatingRecorder.ts` 中的 `RecordingMode` 枚举与状态函数，主进程改用 `audioRecorder !== null` 作为"是否录音中"的单一事实来源（single source of truth）。
- `RecordingPage` 重构为四阶段工作流：① 录音中（纯净波形+控制）→ ② 停止后配置（原始试听 + 后处理开关 + 转写选项）→ ③ 处理中（进度+步骤显示）→ ④ 完成（成品/原始 A/B 对比试听）。
- 后处理开关面板在"停止后"阶段出现（非录音时），初始值取自全局默认设置，本次可临时覆盖。
- 后处理结果与原始录音均复用现有 `AudioPlayer` 组件提供波形播放、倍速、音量、A/B 对比试听。
- 数据契约：转写任务**始终使用原始 WAV**（无损、采样率原生）；后处理产出成品作为平行的存储优化产物。原始 WAV **默认保留**。
- 清理实时引擎残留：从 `engines.ts` 删除 `streaming-zipformer`/`qwen3-simulated-streaming` 两个 realtime 引擎及 `getRealtimeModelIds`/`getRealtimeModels`；从 `registry.ts` 删除 `streaming-zipformer-zh` 模型；从 `settingsHandlers`/`preload`/`SettingsModal` 删除 `realtimeModels` 返回与"实时转写模型"分组。
- 清理 `useRecording.ts` 中对已删除的 `realtimeEngineConfig` 设置的读取。

## Capabilities

### New Capabilities
- `recording-workflow`: 录音页四阶段工作流——录音、停止后配置、后处理进度、完成对比试听；状态机驱动；转写用原始 WAV 的契约；成品/原始双文件 A/B 试听。

### Modified Capabilities
- `audio-postprocessing`: 后处理触发时机从"停止即异步处理"调整为"停止后用户在配置阶段主动触发"；产出成品作为平行文件，不再删除原始（默认保留）。
- `recording-ui`: 后处理 UI 从死代码 RecordingModal 迁移到实际使用的 RecordingPage；新增原始/成品 A/B 对比试听区域。

### Removed Capabilities
- `floating-recorder-window`: 移除浮动录音窗口及其生命周期管理。
- `global-shortcut-recording`: 移除全局快捷键唤起录音。
- `recording-save-dialog`: 移除浮动窗口专用的保存对话框（功能并入 RecordingPage 完成阶段）。

## Impact

- **删除文件**：`src/main/windows/floatingRecorder.ts`、`src/main/shortcuts/globalShortcuts.ts`、`src/renderer/src/pages/FloatingRecorderPage.tsx`、`src/renderer/src/components/RecordingSaveDialog.tsx`、`src/renderer/src/components/RecordingModal.tsx`。
- **主进程**：`index.ts` 删除快捷键注册/注销；`recordingHandlers.ts` 删除 3 个 floating handler，状态判断改用 `audioRecorder` 实例。
- **IPC/Preload**：删除浮动/快捷键相关通道与接口。
- **Renderer**：`App.tsx` 删除浮动路由分支；`RecordingPage.tsx` 大幅重构为四阶段；`useRecording.ts` 简化（删旧设置读取）。
- **模型管理**：`engines.ts`/`registry.ts`/`settingsHandlers.ts`/`SettingsModal.tsx` 移除实时引擎与"实时转写模型"分组。
- **数据**：录音记录的 `filePath`（成品或原始）与 `originalFilePath`（保留的原始）语义明确；`create-proofreading-task` 改为优先使用 `originalFilePath`。
- **依赖**：无新增。复用现有 `AudioPlayer`、`ffmpeg`、`postProcessing.ts`。
- **不影响**：离线转写任务队列、说话人分离、AI 分析、知识模块、AudioRecorder 录音核心。
