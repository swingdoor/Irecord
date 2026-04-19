## Why

当前应用只能处理单个文件，处理完成后返回上传页就丢失了结果。用户无法批量处理多个文件，也无法回顾历史识别结果。任务管理功能让用户可以创建多个识别任务、查看处理进度、浏览历史结果。

## What Changes

- 新增任务列表页作为应用主页，展示所有任务（进行中 + 已完成）
- 支持添加多个文件创建任务队列，依次处理
- 进行中的任务显示状态和已用时间
- 已完成的任务点击进入详情页查看识别结果
- 使用 SQLite 持久化存储任务和识别结果
- 重构页面导航：任务列表 → 任务详情/结果页

## Capabilities

### New Capabilities
- `task-queue`: 任务队列管理，包括创建任务、排队处理、状态追踪
- `task-persistence`: 任务和识别结果的本地持久化存储
- `task-list-page`: 任务列表页面，展示所有任务状态

### Modified Capabilities
- `audio-file-upload`: 上传文件后创建任务而非直接开始处理
- `transcription-display`: 结果页改为任务详情页，从持久化存储读取数据

## Impact

**代码影响：**
- 新增 `src/main/db/` — SQLite 数据库模块
- 新增 `src/renderer/src/pages/TaskListPage.tsx` — 任务列表页
- 重构 `src/renderer/src/stores/appStore.ts` — 任务列表状态管理
- 重构 `src/renderer/src/App.tsx` — 页面导航
- 修改 `src/main/ipc.ts` — 任务 CRUD 和队列处理逻辑

**依赖影响：**
- 新增 `better-sqlite3` 用于本地数据库

**用户影响：**
- 应用主页从上传页变为任务列表页
- 支持批量添加文件
- 历史结果可随时查看
