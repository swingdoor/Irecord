## Why

进行中的 `recording-postprocess-workflow` 给录音页加了一整套后处理（压缩 / 降噪 / 裁剪静音 / 响度归一 / A-B 对比试听）。实际评估后结论是：**这些后处理效果不好也不实用**，徒增录音页复杂度（四阶段状态机、成品/原始双文件模型、进度通道），还引入了"原始 vs 成品""转写读哪个文件"的歧义。

同时，实时转写移除（`remove-realtime-transcription`）后，`realtime_recordings` 表上的 `text`/`segments`/`wordCount`/`originalFilePath`/`postProcessing` 字段已成为历史遗骨——录音本身不再产生任何转写文字，这些列要么常空、要么误导（如详情页用 `recording.id` 当 `taskId` 读 results，根本读不到）。

更本质的目标是统一两个入口：**文件上传**与**音频录制**在转写之前只是"数据源不同"，转写之后应当走完全相同的流水线（同一队列、同一结果表、同一详情页、同一 AI 分析）。当前却是录音转写走 `create-proofreading-task` 把任务塞进 `tasks` 表、录音详情页又自己渲染一套转写——既重复又脆弱。

本 change 用「一张任务表 + `source` 判别列」的方案统一两条线：录音页回归纯录音器，录音转写与文件转写共用 `tasks`/`results`/`taskQueue`/`TaskDetailPage`，差异收敛成 `tasks.source` 一列。

**`recording-postprocess-workflow` 自此废弃为旧方案，不再参照。** 其"四阶段工作流""A/B 对比试听""双文件转写契约""停止后用户主动触发后处理"等设计全部作废；其已完成的「浮动录音/全局快捷键删除」「实时引擎残留清理」部分属于独立收尾，不受本 change 影响（那部分与后处理无关，保留其成果）。

## What Changes

- **BREAKING**：移除录音后处理全部能力。删除压缩 / 降噪 / 裁剪静音 / 响度归一 / 保留原始 / A-B 对比试听，以及 `process-recording` IPC、`postprocessing-progress`/`postprocessing-complete`/`postprocessing-error` 通道、`recordingPostProcessing` 设置项。`RecordingPage` 不再有"处理中"与"成品对比"阶段。
- **BREAKING**：`RecordingPage` 从四阶段简化为「录音中 → 停止后（仅转写开关）→ 完成」三阶段；停止后唯一选项是"创建语音转写"。
- **统一转写流水线**：`tasks` 表新增 `source`（`'upload' | 'recording'`）与 `sourceId`（录音来源时 = `realtime_recordings.id`）两列。文件上传产出 `source='upload'`，录音转写产出 `source='recording'`，二者汇入同一 `taskQueue`、同一 `results`、同一 `TaskDetailPage`、同一 AI 分析链。
- **录音转写解耦存储**：录音的转写不再把文字写回 `realtime_recordings`，而是创建一行 `tasks`（`source='recording'`）。`create-proofreading-task` 重命名/改造为 `create-recording-transcription`（语义即"为录音创建转写任务"），复用录音文件引用（`addReference`，不复制文件）。
- **`realtime_recordings` 瘦身为纯音频记录**：逻辑模型仅保留 `id/title/filePath/fileId/fileSize/duration/createdAt`。`text`/`segments`/`wordCount`/`modelType`/`originalFilePath`/`postProcessing` 物理列保留（sql.js 不便 DROP），但代码停止读写。
- **录音转写状态派生**：录音不存转写状态，通过查询 `tasks WHERE source='recording' AND sourceId=?` 派生 `none/pending/processing/completed/failed`。新增 IPC `get-recording-transcription-status`（或批量版）供列表/详情渲染。
- **录音列表操作调整**：去掉「导出 TXT」（录音无文字可导）；「精准校对」改为「语音转写」，仅 `status ∈ {none, failed}` 时出现；新增「转写详情」，仅 `status='completed'` 时出现，点击跳 `TaskDetailPage`。保留「下载 WAV」「删除」。
- **录音详情页改造**：已转写则直接跳 `TaskDetailPage`（复用统一转写/AI 面板）；未转写则展示纯音频播放 + 「语音转写」入口。移除自渲染的 `TranscriptPanel`/`AiPanel(taskId=recording.id)`（消除 id 错配隐患）。
- **文件上传列表过滤**：「文件上传」Tab 仅显示 `source='upload'` 的任务，录音来源的转写任务不混入。

## Capabilities

### New Capabilities
- `unified-transcription-pipeline`: 文件上传与音频录制两个入口汇入同一转写流水线；`tasks.source`/`sourceId` 判别来源；录音转写状态从关联 task 派生；下游（队列/结果/详情/AI）来源无关。

### Modified Capabilities
- `recording-ui`: 录音页从四阶段简化为三阶段（录音中 → 停止后仅转写开关 → 完成）；列表去掉导出 TXT、精准校对改语音转写（仅未转写出现）、新增转写详情入口；详情页已转写跳 TaskDetailPage、未转写展示纯音频。
- `audio-capture`: 录音停止后仅 finalize 原始 WAV 并落地为纯音频记录，不再产出"成品"或后处理产物。

### Removed Capabilities
- `audio-postprocessing`: 移除录音后处理流水线（压缩/降噪/裁剪静音/响度归一/保留原始/A-B 对比）及其 IPC、进度通道、设置项。
- `recording-workflow`: 移除 `recording-postprocess-workflow` 引入的四阶段工作流与双文件转写契约（废弃为旧方案）。

## Impact

- **数据库**：`tasks` 表 `ALTER ADD COLUMN source TEXT DEFAULT 'upload'` 与 `sourceId TEXT`；旧任务默认 `'upload'`，无需迁移脚本。`realtime_recordings` 不加列，遗骨列保留但停用。
- **主进程**：`recordingHandlers.ts` 删 `process-recording` handler 与后处理相关逻辑，`create-proofreading-task` → `create-recording-transcription`（写 `source='recording'`），新增 `get-recording-transcription-status`；`database.ts` `createTask` 签名加 `source`/`sourceId`，新增按 `source/sourceId` 查询；`taskQueue.ts`、`results`、AI 分析链、ASR 子进程**零改动**。
- **IPC/Preload**：删 `process-recording`、`postprocessing-*` 三通道、`exportRealtimeRecordingTxt`（如仅录音列表用）；改 `createProofreadingTask` 接口；加 `getRecordingTranscriptionStatus`。
- **Renderer**：`RecordingPage.tsx` 删后处理 UI 与处理/成品阶段，简化为三阶段单转写开关；`RealtimeRecordingTable.tsx` 调整操作菜单（删 TXT、精准校对改语音转写、加转写详情、按状态显隐）；`RealtimeRecordingDetailPage.tsx` 改为已转写跳转/未转写纯音频；`TaskListPage` 文件上传 Tab 过滤 `source='upload'`；`SettingsModal` 删 `recordingPostProcessing` 设置区。
- **依赖**：无新增。`ffmpeg` 后处理调用路径（`postProcessing.ts`）从录音链路解除引用（文件上传转写的格式转换 `convertToWav` 仍用 ffmpeg，不受影响）。
- **不影响**：`taskQueue` 串行 worker、`results` 表、AI 摘要/关键词/纪要/问答、说话人分离、知识模块、FileManager 引用模型、`TaskDetailPage`。
- **作废**：`recording-postprocess-workflow` 的后处理/四阶段/双文件设计废弃，不再参照；其浮动录音删除与实时引擎清理成果保留。
