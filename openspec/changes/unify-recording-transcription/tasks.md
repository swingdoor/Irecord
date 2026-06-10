## 0. 废弃旧方案 recording-postprocess-workflow

- [x] 0.1 在 `recording-postprocess-workflow/proposal.md` 顶部加废弃声明：其后处理/四阶段/双文件转写契约设计被 `unify-recording-transcription` 取代，不再参照
- [x] 0.2 确认其已落地的「浮动录音/全局快捷键删除」「实时引擎残留清理」与后处理无关，予以保留（本 change 不回滚这部分）
- [x] 0.3 决定旧 change 处置方式：归档（`openspec archive`）或保留并标注废弃（团队约定）— 采用保留+标注废弃，待本 change 实现完再统一归档

## 1. 数据库迁移（tasks 加来源判别列）

- [x] 1.1 `database.ts` 在 `getDb()` 迁移段加 `ALTER TABLE tasks ADD COLUMN source TEXT DEFAULT 'upload'`（try/catch 容忍已存在）
- [x] 1.2 `database.ts` 加 `ALTER TABLE tasks ADD COLUMN sourceId TEXT`（try/catch）
- [x] 1.3 `Task` interface 加 `source: 'upload' | 'recording'`、`sourceId: string | null`
- [x] 1.4 `createTask` 入参加 `source?`、`sourceId?`，INSERT 写入（默认 `'upload'`/null）
- [x] 1.5 新增 `getRecordingTranscriptionTask(recordingId)`：查 `source='recording' AND sourceId=? ORDER BY createdAt DESC LIMIT 1`
- [x] 1.6 编译验证 `npm run build`

## 2. 后端：录音转写创建与状态查询

- [x] 2.1 `recordingHandlers.ts` 将 `create-proofreading-task` 改造为 `create-recording-transcription`：createTask 带 `source:'recording'`、`sourceId:recordingId`，转写源直接用 `recording.filePath`（删 originalFilePath 回退分支）
- [x] 2.2 文件引用复用：有 `fileId` 用 `addReference`，否则 `registerFile`（以 filePath）
- [x] 2.3 新增 IPC `get-recording-transcription-status(recordingId)` → `{ status: 'none'|'pending'|'processing'|'completed'|'failed', taskId? }`
- [x] 2.4 `taskHandlers.ts` 的 `add-files`/`add-dropped-files` 经 `createTask` 显式带 `source:'upload'`（或依赖默认值，确认行为）
- [x] 2.5 编译验证 `npm run build`

## 3. 后端：移除后处理

- [x] 3.1 `recordingHandlers.ts` 删除 `process-recording` handler 及 `processRecording` import
- [x] 3.2 `save-realtime-recording` handler 去掉 `originalFilePath`/`postProcessing`/`createProofreadingTask` 中后处理相关入参；保留"可选创建转写"逻辑（改调 create-recording-transcription 等价流程）
- [x] 3.3 `createRealtimeRecording`（database.ts）去掉 `originalFilePath`/`postProcessing` 写入（物理列保留，传 null）
- [x] 3.4 `RealtimeRecording` interface 去掉 `text`/`segments`/`wordCount`/`modelType`/`originalFilePath`/`postProcessing`（保留 id/title/filePath/fileId/fileSize/duration/createdAt）
- [x] 3.5 preload 删除 `processRecording`、`onPostprocessingProgress`/`onPostprocessingComplete`/`onPostprocessingError`
- [x] 3.6 `settings.ts` / `SettingsModal` 删除 `recordingPostProcessing` 字段与设置区（SettingsModal 无后处理 UI，仅清理 settings.ts）
- [x] 3.7 `postProcessing.ts` 从录音链路解除引用（确认无其他调用方；保留 ffmpeg 的 convertToWav 给文件转写用）
- [x] 3.8 编译验证 `npm run build`

## 4. 前端：录音页三阶段化

- [x] 4.1 `RecordingPage.tsx` 删除 `PostProcessingSettings`/`DEFAULT_PP`/`ppSettings` 状态与加载逻辑
- [x] 4.2 删除 `processing` 与成品对比相关阶段、`productFile`/`ppProgress`/`ppFailed` 状态、后处理事件订阅
- [x] 4.3 阶段② 仅保留原始 WAV 试听 + "创建语音转写"勾选 + 放弃/保存
- [x] 4.4 `handleSave`：调 saveRealtimeRecording（无后处理字段），勾选则触发录音转写
- [x] 4.5 阶段③ 完成：显示"录音已保存"+（若转写）"转写任务已创建 → 去查看"
- [x] 4.6 `Stage` 类型简化为 `'recording' | 'stopped' | 'done'`
- [x] 4.7 编译验证 `npm run build`

## 5. 前端：录音列表操作

- [x] 5.1 `RealtimeRecordingTable.tsx` 接入每条录音的派生转写状态（前端用 get-all-tasks 按 sourceId 建 Map，或调批量状态接口）
- [x] 5.2 操作菜单删除「导出 TXT」与 `handleExportTxt`
- [x] 5.3 「精准校对」改为「语音转写」，仅 `status ∈ {none, failed}` 显示，点击调 create-recording-transcription
- [x] 5.4 新增「转写详情」，仅 `status='completed'` 显示，点击 `setCurrentTaskId(taskId); setPage('taskDetail')`
- [x] 5.5 转写中（pending/processing）显示"转写中"提示、隐藏创建入口
- [x] 5.6 保留「下载 WAV」「删除」；移除 modelType 列展示（或改为转写状态列）
- [x] 5.7 编译验证 `npm run build`

## 6. 前端：录音详情页分流

- [x] 6.1 `RealtimeRecordingDetailPage.tsx` 加载时查转写状态；`completed` 则直接 `setCurrentTaskId(taskId); setPage('taskDetail')`
- [x] 6.2 非 completed：展示 AudioPlayer（纯音频）+「语音转写」入口（转写中显示进行中提示）
- [x] 6.3 删除自渲染的 `TranscriptPanel` 与 `AiPanel(taskId=recording.id)`（消除 id 错配）
- [x] 6.4 删除「导出 TXT」「精准校对」按钮，操作改为「语音转写/转写详情」与「下载 WAV」
- [x] 6.5 编译验证 `npm run build`

## 7. 前端：文件上传列表过滤

- [x] 7.1 `TaskListPage`/`TaskTable` 文件上传 Tab 数据过滤 `source !== 'recording'`
- [x] 7.2 `TaskDetailPage` 返回按 `source` 决定回到对应 Tab（recording → 实时录音 Tab）
- [x] 7.3 编译验证 `npm run build`

## 8. 清理与验证

- [x] 8.1 全局搜索确认无残留引用：`process-recording`、`postprocessing-*`、`recordingPostProcessing`、`exportRealtimeRecordingTxt`（若删）、`originalFilePath`/`postProcessing`（录音侧）
- [x] 8.2 `appStore` 的 `RealtimeRecording` 类型同步瘦身
- [x] 8.3 `npm run build` 全量通过
- [ ] 8.4 `npm run dev` 手测：① 文件上传转写 → TaskDetailPage；② 录音→勾转写→保存→实时录音列表显示"转写中"→完成后"转写详情"跳同一 TaskDetailPage；③ 录音→不勾→仅录音记录；④ failed 录音可重新「语音转写」；⑤ 文件上传 Tab 不含录音来源任务
- [ ] 8.5 验证旧数据兼容：历史 task 默认 `source='upload'` 正常显示；历史录音含残留 text/segments 不报错
