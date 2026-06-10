## ADDED Requirements

### Requirement: 统一转写流水线来源判别
系统 SHALL 在 `tasks` 表通过 `source` 与 `sourceId` 两列区分转写任务的来源，使文件上传与音频录制两个入口汇入同一转写流水线。

#### Scenario: 文件上传来源标记
- **WHEN** 用户通过文件上传创建转写任务
- **THEN** 该 task 的 `source` 为 `'upload'`，`sourceId` 为 null

#### Scenario: 音频录制来源标记
- **WHEN** 用户为某条录音创建语音转写任务
- **THEN** 该 task 的 `source` 为 `'recording'`，`sourceId` 为对应 `realtime_recordings.id`

#### Scenario: 旧任务向后兼容
- **WHEN** 读取本 change 之前创建的历史任务
- **THEN** 其 `source` 取默认值 `'upload'`，`sourceId` 为 null，不影响展示与处理

### Requirement: 下游流水线来源无关
系统 SHALL 使转写队列、结果存储、任务详情页与 AI 分析对任务来源完全无感，两种来源共用同一套下游能力。

#### Scenario: 共用串行队列
- **WHEN** 上传任务与录音转写任务同时处于 pending
- **THEN** 二者由同一 `taskQueue` 串行消费，按 `createdAt` 顺序逐个执行 ASR，互不区分来源

#### Scenario: 共用结果与详情
- **WHEN** 任一来源的任务完成转写
- **THEN** 结果写入同一 `results` 表（按 taskId），并通过同一 `TaskDetailPage` 展示转写面板与 AI 分析

#### Scenario: 共用 AI 分析
- **WHEN** 任一来源的任务完成转写
- **THEN** AI 摘要/关键词/纪要/问答按 taskId 触发与存储，来源不影响行为

### Requirement: 录音转写状态派生
系统 SHALL 通过查询关联 task 派生录音的转写状态，不在 `realtime_recordings` 表冗余存储转写状态。

#### Scenario: 查询最新关联任务
- **WHEN** 需要某录音的转写状态
- **THEN** 系统查询 `tasks WHERE source='recording' AND sourceId=:recordingId ORDER BY createdAt DESC LIMIT 1` 得到关联任务

#### Scenario: 状态映射
- **WHEN** 关联任务不存在或仅有 failed 任务
- **THEN** 派生状态为 `none`/`failed`，允许创建（或重新创建）转写
- **WHEN** 关联任务为 pending 或 processing
- **THEN** 派生状态为转写中，不允许重复创建
- **WHEN** 关联任务为 completed
- **THEN** 派生状态为 completed，提供进入转写详情的入口

#### Scenario: 批量状态查询
- **WHEN** 渲染录音列表需要每条记录的转写状态
- **THEN** 前端一次性获取全部任务并按 `sourceId` 建立映射，避免逐条查询

### Requirement: 录音转写复用文件引用
系统 SHALL 在为录音创建转写任务时复用录音的文件引用，不复制音频文件。

#### Scenario: 已注册文件复用
- **WHEN** 录音已有 `fileId` 且为其创建转写任务
- **THEN** 通过 `addReference` 让新 task 引用同一文件，不在磁盘复制

#### Scenario: 兼容未注册文件
- **WHEN** 录音无 `fileId`（旧数据）且为其创建转写任务
- **THEN** 通过 `registerFile` 以录音 `filePath` 注册并关联到新 task
