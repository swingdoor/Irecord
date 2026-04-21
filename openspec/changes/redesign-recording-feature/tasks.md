## 1. 数据库层

- [x] 1.1 在 database.ts 中创建 realtime_recordings 表结构
- [x] 1.2 实现 createRealtimeRecording 函数
- [x] 1.3 实现 getAllRealtimeRecordings 函数
- [x] 1.4 实现 getRealtimeRecording 函数
- [x] 1.5 实现 deleteRealtimeRecording 函数
- [x] 1.6 添加 RealtimeRecording 类型定义

## 2. 后端 IPC 层

- [x] 2.1 添加 get-realtime-recordings IPC handler
- [x] 2.2 添加 get-realtime-recording IPC handler
- [x] 2.3 添加 delete-realtime-recording IPC handler
- [x] 2.4 添加 export-realtime-recording-wav IPC handler
- [x] 2.5 添加 export-realtime-recording-txt IPC handler
- [x] 2.6 添加 create-proofreading-task IPC handler
- [x] 2.7 修改 start-recording IPC handler，移除自动创建任务逻辑
- [x] 2.8 修改 stop-recording IPC handler，保存到 realtime_recordings 表
- [x] 2.9 添加 save-realtime-recording IPC handler（用于确认对话框）

## 3. 前端类型定义

- [x] 3.1 在 appStore.ts 中添加 RealtimeRecording 类型
- [x] 3.2 在 appStore.ts 中添加 realtimeRecordingDetail 页面类型
- [x] 3.3 添加 realtime recordings 相关的 state 和 actions

## 4. 录音页面重构

- [x] 4.1 修改 RecordingPage 布局：顶部信息区
- [x] 4.2 修改 RecordingPage 布局：音频区（波形+控制）
- [x] 4.3 修改 RecordingPage 布局：对话区（实时转写）
- [x] 4.4 移除自动开始录音逻辑
- [x] 4.5 实现手动开始按钮
- [x] 4.6 实现暂停功能（断开音频输入）
- [x] 4.7 实现继续功能（恢复音频输入）
- [x] 4.8 实现暂停时长排除逻辑
- [x] 4.9 修改标题生成逻辑为 YYYYMMDDHHmmss 格式

## 5. 确认对话框

- [x] 5.1 创建确认对话框组件
- [x] 5.2 实现"不保存"按钮逻辑
- [x] 5.3 实现"继续录音"按钮逻辑
- [x] 5.4 实现"结束录音"按钮逻辑
- [x] 5.5 实现精准校对 checkbox
- [x] 5.6 集成到 RecordingPage 的停止和返回按钮

## 6. 主页面 Tab 功能

- [x] 6.1 在 TaskListPage 中添加 Tabs 组件
- [x] 6.2 创建 RealtimeRecordingTable 组件
- [x] 6.3 实现录音记录列表显示（标题、时间、时长、字数）
- [x] 6.4 实现操作菜单（下载 WAV、导出 TXT、精准校对、删除）
- [x] 6.5 实现 Tab 切换逻辑
- [x] 6.6 实现 Tab 状态持久化

## 7. 实时录音详情页

- [x] 7.1 创建 RealtimeRecordingDetailPage 组件
- [x] 7.2 实现页面布局（复用 TaskDetailPage 结构）
- [x] 7.3 集成 AudioPlayer 组件
- [x] 7.4 集成 TranscriptPanel 组件
- [x] 7.5 集成 AiPanel 组件
- [x] 7.6 实现导出按钮
- [x] 7.7 实现精准校对按钮
- [x] 7.8 在 App.tsx 中添加路由

## 8. 精准校对功能

- [x] 8.1 实现从确认对话框创建精准校对任务
- [x] 8.2 实现从录音列表创建精准校对任务
- [x] 8.3 实现从详情页创建精准校对任务
- [x] 8.4 确保任务创建后自动启动队列
- [x] 8.5 实现创建后跳转到文件上传 Tab

## 9. 文件管理

- [x] 9.1 确保 WAV 文件保存到 userData/recordings/ 目录
- [x] 9.2 实现文件命名逻辑（语音_YYYYMMDDHHmmss.wav）
- [x] 9.3 实现删除录音记录时的文件清理逻辑（可选）

## 10. 测试和优化

- [x] 10.1 测试完整录音流程（开始-暂停-继续-停止）
- [x] 10.2 测试确认对话框的三个按钮
- [x] 10.3 测试精准校对功能
- [x] 10.4 测试 Tab 切换和数据显示
- [x] 10.5 测试实时录音详情页
- [x] 10.6 测试删除功能
- [x] 10.7 优化 UI 细节和动画
