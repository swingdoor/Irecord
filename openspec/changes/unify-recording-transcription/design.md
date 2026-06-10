## Context

项目有两个产生"待转写音频"的入口：**文件上传**（外部音视频）与**音频录制**（应用内麦克风录制）。两者在转写之前只是数据来源不同，转写之后理应完全一致。但现状是分裂的：

- 文件上传 → `createTask` → `tasks` 表 → `taskQueue` 串行 ASR → `results` 表 → `TaskDetailPage` + AI 分析。
- 音频录制 → 先 `save-realtime-recording` 存 `realtime_recordings`，转写走 `create-proofreading-task` 同样塞进 `tasks` 表，但录音详情页 `RealtimeRecordingDetailPage` 又自己渲染一套转写/AI（且 `AiPanel taskId={recording.id}` 用录音 id 当 taskId，读不到 `results`，是隐性 bug）。

同时进行中的 `recording-postprocess-workflow` 给录音页加了后处理（压缩/降噪/裁剪/响度归一/A-B 对比/双文件转写契约/四阶段状态机）。评估结论：**后处理效果不好不实用，复杂度不值**。

**关键约束（来自用户决策）**：
1. 后处理**全部移除**。
2. 表设计采用**方案 A：一张 `tasks` 表 + `source` 判别列**（已对比方案 B 两张表后选定）。
3. `recording-postprocess-workflow` **废弃为旧方案，不再参照**。

**为何方案 A**（决策记录，详见下方 Decision 1）：转写队列是**单消费者、串行、独占一个 ASR 子进程**的架构。两张表不会变成两个独立队列——它们最终喂给同一个 worker，方案 B 反而要写"跨两表合并选下一个"的调度逻辑，把想拆开的耦合又粘回来。方案 A 让"两入口除数据源外完全一致"在结构上天然成立。

## Goals / Non-Goals

**Goals:**
- 移除录音后处理全部能力，录音页回归纯录音器。
- `tasks` 表加 `source`/`sourceId`，统一文件上传与录音转写的下游流水线。
- 录音转写不写回 `realtime_recordings`，改为创建 `source='recording'` 的 task。
- 录音转写状态从关联 task 派生，不在录音表冗余存储。
- 录音列表/详情按转写状态显隐操作；已转写跳 `TaskDetailPage` 复用统一详情。
- 明确废弃 `recording-postprocess-workflow`，保留其与后处理无关的清理成果（浮动录音/快捷键删除、实时引擎清理）。

**Non-Goals:**
- 不改 `taskQueue` 串行 worker、`results` 表结构、AI 分析链、ASR 子进程、`TaskDetailPage`。
- 不改文件上传转写流程（仅 `createTask` 显式带 `source='upload'`，走默认值即可）。
- 不做录音转写的独立队列/并发（沿用单消费者串行）。
- 不物理删除 `realtime_recordings` 的遗骨列（sql.js 删列代价高，停用即可）。
- 不引入录音转写专用模型或参数（与文件上传共用 `settings.defaultModel`）。

## Decisions

### 1. 表设计：一张 `tasks` 表 + `source` 判别列（方案 A）

**决策**：`tasks` 加两列：
```sql
ALTER TABLE tasks ADD COLUMN source   TEXT DEFAULT 'upload';  -- 'upload' | 'recording'
ALTER TABLE tasks ADD COLUMN sourceId TEXT;                   -- recording 来源 = realtime_recordings.id
```
`source` 一列同时承担**过滤**（上传 Tab 只显示 `'upload'`）与**反查**（录音详情通过 `source='recording' AND sourceId=?` 找其转写任务）两个职责。

**理由**：
- 队列是单消费者串行、独占 ASR 子进程。两张表仍喂同一 worker，方案 B 必须写跨表合并调度，等于重新耦合 + 额外复杂度，且没买到任何独立性。
- 方案 A 下，最脆弱的 `taskQueue` / `results` / AI / `TaskDetailPage` **零改动**——未来任何转写能力（重试/取消/新模型/AI）自动覆盖两种来源。
- 目标"两入口除数据源外完全一致"用"同一张表=同一条流水线"在结构上天然成立。

**对比方案 B（两张表 `realtime_transcription_tasks`）—— 否决**：差异散布在队列、结果、AI、详情、进度五处；被迫改动单例状态机引入竞态；每个能力实现两遍或再抽象一层。仅当录音转写需要**根本不同**的引擎/字段/生命周期时才值得，但用户明确要求一致。

### 2. 录音转写创建：复用文件引用，不复制

**决策**：`create-proofreading-task` 改造为 `create-recording-transcription`，行为：
```typescript
const task = await createTask({
  fileName: recording.title,
  filePath: recording.filePath,       // 录音原始 WAV（不再有 originalFilePath 回退分支）
  fileSize: recording.fileSize,
  duration: recording.duration,
  modelType: settings.defaultModel || 'qwen3-asr',
  status: 'pending',
  source: 'recording',
  sourceId: recording.id,
})
// 复用录音的文件引用，不复制文件
if (recording.fileId) addReference({ fileId: recording.fileId, ownerId: task.id, ownerType: 'task' })
else registerFile({ filePath: recording.filePath, ownerId: task.id, ownerType: 'task' })
startQueue(win)
```

**理由**：后处理删除后没有"成品 vs 原始"之分，`filePath` 即唯一录音文件，转写源逻辑从"优先 originalFilePath 回退 filePath"简化为"就用 filePath"。文件引用复用避免磁盘冗余。

### 3. 录音转写状态派生（不冗余存储）

**决策**：`realtime_recordings` 不存转写状态，运行时查询派生：
```sql
SELECT * FROM tasks
WHERE source='recording' AND sourceId=:recordingId
ORDER BY createdAt DESC LIMIT 1
```
状态机：
```
查询结果              派生状态        列表/详情展示       点击
─────────────────────────────────────────────────────────────
无 / 仅 failed        none/failed     「语音转写」        创建转写任务
pending / processing  转写中           「转写中…」(禁用)   —
completed             completed        「转写详情」        跳 TaskDetailPage
```
新增 IPC `get-recording-transcription-status(recordingId) → { status, taskId? }`。列表批量渲染时前端用 `get-all-tasks` 结果按 `sourceId` 建 Map，避免 N 次查询。

**理由**：单一事实来源——转写状态本就属于 task，录音表冗余存会产生不一致风险（与方案 A "差异收敛成一列"一脉相承）。

**备选**：在 `realtime_recordings` 加 `transcriptionTaskId` 正向指针（列表渲染 O(1) 不用 Map）→ 否决：仍要加 `source`，等于两处都改；本地小数据量子查询/Map 成本可忽略。

### 4. 录音页三阶段（删后处理）

**决策**：`RecordingPage` 从四阶段（录音中→停止后配置→处理中→完成）简化为三阶段：
```
① recording/paused   纯波形 + 计时 + 暂停/停止
        │ stop → finalize 原始 WAV
② stopped            原始 WAV 试听 + ☑创建语音转写（唯一开关）+ [放弃][保存]
        │ save → saveRealtimeRecording (+ 可选 createRecordingTranscription)
③ done               「录音已保存」+（若勾选）「转写任务已创建 → 去查看」
```
删除：后处理开关面板、`processing` 阶段、成品/原始 A-B 对比、体积对比、`process-recording` 调用、`postprocessing-*` 事件订阅、`ppSettings` 状态、`recordingPostProcessing` 设置读取。

**理由**：保存瞬时完成，转写在后台队列异步跑，无需"处理中"阶段。录音页职责干净：录音 + 落地 + 可选触发转写。

### 5. `realtime_recordings` 瘦身为纯音频记录

**决策**：逻辑模型仅保留 `id/title/filePath/fileId/fileSize/duration/createdAt`。`text`/`segments`/`wordCount`/`modelType`/`originalFilePath`/`postProcessing` 物理列保留、代码停用，新记录留空。
```typescript
interface RealtimeRecording {
  id: string; title: string; filePath: string
  fileId: string | null; fileSize: number; duration: number; createdAt: string
}
```

**理由**：sql.js（旧 SQLite）`DROP COLUMN` 不便，物理删列需重建表迁移、风险高收益低。停用即可，遗骨列当死代码晾着，零迁移风险。`save-realtime-recording` 不再接收/写入这些字段。

### 6. 录音详情页：已转写跳转，未转写纯音频

**决策**：
- `completed` → 进入详情时直接 `setCurrentTaskId(task.id); setPage('taskDetail')`，复用 `TaskDetailPage`（统一转写面板 + AI 面板）。
- 其他状态 → 展示 `AudioPlayer`（纯音频）+ 「语音转写」入口（+ 转写中提示）。

**理由**：消除 `RealtimeRecordingDetailPage` 自渲染转写的重复实现与 `taskId=recording.id` 错配 bug；已转写内容的真正归属是 `results`（按 taskId），跳 `TaskDetailPage` 才是正解。

### 7. 文件上传列表过滤

**决策**：「文件上传」Tab 的 `TaskTable` 数据过滤 `source !== 'recording'`（即 `'upload'` 或旧数据 null/默认）。

**理由**：录音转写虽进 `tasks`，但用户心智里它属于"实时录音"，不应混入文件上传列表。来源标记 `source` 天然支持此过滤。

## Risks / Trade-offs

### [风险] 删除后处理与进行中的 recording-postprocess-workflow 正面冲突
**场景**：那个 change 正在加后处理（完成 52/64），本 change 要删。
**缓解**：本 change 在 proposal/design 显式声明其后处理/四阶段/双文件设计**废弃为旧方案**；归档或标注 `recording-postprocess-workflow` 时保留其"浮动录音/快捷键删除""实时引擎清理"成果（与后处理正交）。落地第一步即处理这个关系（见 tasks 第 0 节）。

### [风险] 录音详情"已转写跳转"导致用户找不到录音本身
**场景**：completed 录音点进去直接是 TaskDetailPage，看不到"这是录音"。
**缓解**：TaskDetailPage 返回按 `source` 决定回到哪个 Tab（recording→实时录音 Tab）；或列表项保留"下载 WAV"直接操作录音文件。

### [权衡] 状态派生需查询 vs 冗余存储
**场景**：每次渲染录音列表要关联查 tasks。
**缓解**：批量 `get-all-tasks` + 前端 Map，单次查询 O(n) 建表；本地数据量小，无性能问题。

### [风险] 删录音时关联转写 task 的处理
**场景**：删 `realtime_recordings` 一行，其 `source='recording'` task 是否级联删？
**缓解**：见 Open Question 1，倾向解耦（删录音不动 task，task 是独立转写产物）。

## Migration Plan

1. **先处理旧 change 关系**：标注/归档 `recording-postprocess-workflow` 为废弃（保留浮动/实时引擎清理成果）。
2. **DB 迁移**：`tasks` 加 `source`/`sourceId` 两列（`ADD COLUMN`，旧数据默认 `'upload'`/null，向后兼容）。
3. **后端**：`createTask` 加 `source`/`sourceId` 入参；`create-proofreading-task`→`create-recording-transcription` 写 `source='recording'`；新增 `get-recording-transcription-status`；删 `process-recording` 与后处理逻辑；`save-realtime-recording` 去掉后处理/原始字段入参。
4. **前端**：`RecordingPage` 三阶段化；`RealtimeRecordingTable` 操作按状态显隐；`RealtimeRecordingDetailPage` 跳转/纯音频；`TaskTable` 过滤 `source='upload'`；`SettingsModal` 删后处理设置区。
5. **每步 `npm run build` 验证**；最后 `npm run dev` 手测两入口转写汇合到同一详情页。

## Open Questions

1. **删录音是否级联删其转写 task？** 建议解耦：删录音仅移除录音文件引用，转写 task 独立保留（它已是 results 里的转写产物）。或弹窗让用户选。
2. **录音详情 completed 直接跳转 vs 内嵌入口？** 建议直接跳 TaskDetailPage（复用最大化）；若担心迷失，TaskDetailPage 返回时按 source 回到对应 Tab。
3. **`exportRealtimeRecordingTxt` IPC 是否完全删除？** 录音列表去掉导出 TXT 后，若无其他调用方则删；转写后的 TXT 导出由 TaskDetailPage 的 `export-txt` 承担。
4. **旧录音记录里残留的 text/segments（实时转写时代写入的）如何展示？** 建议忽略（停用即不读）；若要兼容老数据展示，可在详情页对 `none` 状态但有 text 的旧记录做只读降级展示——非必须。
