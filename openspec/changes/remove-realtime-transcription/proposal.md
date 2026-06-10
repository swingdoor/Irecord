## Why

本地实时转写（streaming-zipformer / Qwen3 模拟流式）识别质量不达预期，边录边出字的草稿对用户价值有限，却引入了 ~100MB 流式模型、额外的引擎配置和与录音强耦合的代码。同时项目已存在质量更高的离线转写通路（任务队列 SenseVoice/Qwen3-ASR + 说话人分离 + AI 分析），实时转写实质上只是个低质量预览，可以安全移除。移除后将录音定位为纯粹的"高质量本地录音器"，并补上一组真正实用的录音后处理能力。

## What Changes

- **BREAKING**：移除实时语音识别能力。删除 `realtime-recognizer.ts`、`qwen3-realtime-recognizer.ts`、`RealtimeTranscript.tsx`，删除 `onRealtimeResult` / `onSegmentComplete` / `recording-error`(转写部分) 等 IPC，删除 `realtimeEngineConfig` 设置项。
- **BREAKING**：录音界面移除"实时转写文字区"，替换为一组可选的后处理开关面板（压缩 / 降噪 / 静音裁剪 / 响度归一 / 是否保留原始）。
- 将原本嵌在 recognizer 内部的 WAV 写盘逻辑剥离为独立的纯录音器（`AudioRecorder`），音频块只写 WAV、不再喂给 ASR。
- 新增录音后处理流水线：录音停止后，按用户勾选项用单条 ffmpeg 滤镜链（afftdn → silenceremove → loudnorm）一次性处理，并可压缩编码为 M4A/MP3。处理异步执行并显示进度，不阻塞 UI。
- 后处理开关支持"全局默认 + 本次停止时临时覆盖"两级；"是否保留原始 WAV"由用户勾选决定。
- 录音 30 分钟时长上限从 recognizer 搬入 `AudioRecorder` 并放宽（纯录音无需受转写限制）。
- 打包配置移除 `streaming-zipformer-zh-int8` 模型（瘦身 ~100MB）。
- 保持不变：麦克风采集链路、离线高质量转写（任务队列）、AI 摘要/关键词、波形可视化、录音记录存储/列表/详情、`create-proofreading-task` 入口。

## Capabilities

### New Capabilities
- `audio-postprocessing`: 录音后处理流水线——降噪、静音裁剪、响度归一、压缩编码（单条 ffmpeg 滤镜链 + 一次编码），全局默认配置与本次覆盖，原始文件保留策略，异步执行与进度反馈。

### Modified Capabilities
- `audio-capture`: WAV 写盘从转写器中剥离为独立录音器；录音时长上限迁移并放宽；录音停止后产出原始 WAV 作为后处理输入。
- `recording-ui`: 移除实时转写文字区与相关状态/IPC；新增后处理开关面板；停止录音后串接后处理与保存流程。

### Removed Capabilities
- `realtime-recognition`: 整块移除流式识别引擎、实时结果回传、端点检测与分段，及对应模型与设置项。

## Impact

- **代码**：删除 `src/main/engine/realtime-recognizer.ts`、`qwen3-realtime-recognizer.ts`，简化/替换 `IRealtimeRecognizer.ts`；新增 `AudioRecorder` 与后处理模块（复用 `src/main/audio/ffmpeg.ts`）；改造 `recordingHandlers.ts`、`useRecording.ts`、`RecordingModal.tsx`、`FloatingRecorderPage.tsx`；删除 `RealtimeTranscript.tsx`。
- **IPC / Preload**：移除实时转写相关通道（`realtime-result`、`segment-complete`、`onRealtimeResult`、`onSegmentComplete`）；新增后处理触发与进度通道。
- **设置**：移除 `realtimeEngineConfig`（含 zipformer/qwen3 参数）；新增后处理默认配置（开关 + 编码格式 + 保留原始）。
- **打包**：从 `extraResources` 移除 `sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30`，体积减少 ~100MB；流式模型下载/校验逻辑相应清理。
- **依赖**：无新增。后处理完全复用已打包的 ffmpeg/ffprobe。
- **数据**：录音记录可不再强制含转写 `segments`/`text`；后处理产出文件路径与"是否保留原始"需在记录中体现（向后兼容旧记录）。
- **不影响**：离线转写任务队列、说话人分离、AI 分析/关键词、知识模块。
