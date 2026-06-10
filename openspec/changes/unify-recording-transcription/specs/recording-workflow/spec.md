## REMOVED Requirements

### Requirement: 录音页四阶段工作流
**Reason**: 四阶段工作流（录音中 → 停止后配置 → 处理中 → 完成）由 `recording-postprocess-workflow`（旧方案）引入，其核心是后处理。后处理移除后，简化为三阶段（见 `recording-ui` 的「录音页三阶段工作流」）。**`recording-postprocess-workflow` 废弃为旧方案，不再参照。**

**Migration**: 录音页改为三阶段：录音中 → 停止后（仅转写开关）→ 完成。删除"处理中"阶段与后处理配置阶段。

### Requirement: 原始与成品 A/B 对比试听
**Reason**: A/B 对比试听服务于后处理效果对比，后处理移除后失去意义。

**Migration**: 完成阶段不再显示成品/原始双播放器与体积对比；停止后阶段仅一个原始 WAV 试听播放器。

### Requirement: 转写任务使用原始音频契约
**Reason**: "优先用 originalFilePath、回退 filePath"的双文件转写契约源于后处理产生成品。后处理移除后录音文件唯一，契约简化为直接使用 `filePath`。

**Migration**: `create-recording-transcription` 直接以录音 `filePath` 为转写源，删除 originalFilePath 回退分支与相关精度提示。
