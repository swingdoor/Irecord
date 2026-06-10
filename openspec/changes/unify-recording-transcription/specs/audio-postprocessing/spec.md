## REMOVED Requirements

### Requirement: 录音后处理流水线
**Reason**: 后处理（压缩/降噪/裁剪静音/响度归一）实际效果不佳且不实用，复杂度（四阶段状态机、双文件模型、进度通道）不值得保留。本能力整体移除。

**Migration**: 录音停止后不再有后处理环节，直接落地原始 WAV。`process-recording` IPC、`postprocessing-progress`/`postprocessing-complete`/`postprocessing-error` 通道、`recordingPostProcessing` 设置项全部删除。已存在的录音记录其 `postProcessing` 列停用（不读不写）。`postProcessing.ts` 从录音链路解除引用。

### Requirement: 后处理全局默认与本次覆盖
**Reason**: 后处理能力整体移除，配置项随之失去意义。

**Migration**: 删除 `SettingsModal` 中的后处理设置区与 `settings.recordingPostProcessing` 字段。

### Requirement: 原始文件保留策略
**Reason**: 移除后处理后不再有"原始 vs 成品"之分，录音文件唯一，无需保留策略。

**Migration**: 录音 `filePath` 即唯一音频文件；`originalFilePath` 列停用。
