## Why

当前录音功能的交互混乱，用户体验不佳。录音页面采用居中式布局浪费空间，控制逻辑不清晰，且录音记录与文件上传任务混在一起难以区分。需要重新设计录音功能的完整交互流程和界面布局，提供清晰的信息架构和更好的用户体验。

## What Changes

- 主页面任务列表区域增加 Tab 分隔：实时录音 / 文件上传
- 创建独立的实时录音记录数据表（realtime_recordings）
- 重构录音页面布局：顶部信息区 + 音频区（波形+控制）+ 对话区（实时转写）
- 优化录音控制逻辑：开始 → 暂停/停止，暂停期间不存储数据
- 添加结束录音确认对话框，支持"精准校对"选项
- 创建实时录音详情页，复用任务详情页的布局和 AI 功能
- 实时录音记录支持：查看、导出 WAV、导出 TXT、精准校对、删除
- 文件命名规则：语音_年月日时分秒.wav（14位数字）

## Capabilities

### New Capabilities
- `realtime-recording-management`: 实时录音记录的创建、存储、查询、删除功能
- `recording-page-layout`: 录音页面的界面布局和交互逻辑
- `recording-confirmation-dialog`: 结束录音确认对话框及精准校对选项
- `realtime-recording-detail`: 实时录音详情页，包含播放、转写文本、AI 分析功能
- `task-list-tabs`: 主页面任务列表的 Tab 分隔功能

### Modified Capabilities
- `recording-control`: 录音控制逻辑从自动开始改为手动触发，增加暂停功能
- `proofreading-task`: 精准校对功能从停止录音时自动创建改为可选创建

## Impact

**数据库**：
- 新增 realtime_recordings 表
- tasks 表保持不变

**前端组件**：
- 修改 TaskListPage：增加 Tab 切换
- 重构 RecordingPage：新布局和控制逻辑
- 新增 RealtimeRecordingDetailPage：详情页
- 新增 RealtimeRecordingTable：录音记录列表组件

**后端 IPC**：
- 新增实时录音记录相关的 IPC handlers
- 修改录音控制相关的 IPC handlers

**文件存储**：
- WAV 文件统一存储在 userData/recordings/ 目录
- 文件命名规则变更
