## 1. 数据库模块

- [x] 1.1 安装 better-sqlite3 依赖
- [x] 1.2 新建 src/main/db/database.ts，实现数据库初始化和建表
- [x] 1.3 实现任务 CRUD 操作（createTask, getTask, getAllTasks, updateTask, deleteTask）
- [x] 1.4 实现结果存取操作（saveResult, getResult）

## 2. 任务队列

- [x] 2.1 新建 src/main/taskQueue.ts，实现串行任务队列
- [x] 2.2 实现队列调度：自动取 pending 任务开始处理，完成后处理下一个
- [x] 2.3 处理失败时更新状态为 failed，继续处理队列

## 3. IPC 重构

- [x] 3.1 新增 IPC：add-files（添加文件创建任务）、get-tasks（获取任务列表）、get-task-result（获取任务结果）、delete-task（删除任务）
- [x] 3.2 移除旧的 start-processing 单任务逻辑，改为队列驱动
- [x] 3.3 新增 IPC 事件：task-status-changed（任务状态变化通知前端）

## 4. 前端状态重构

- [x] 4.1 重构 appStore.ts：任务列表状态、当前查看的任务 ID、页面导航
- [x] 4.2 更新 preload/index.ts：新增任务管理相关 API 类型

## 5. 前端页面

- [x] 5.1 新建 TaskListPage.tsx：任务列表主页（添加文件、进行中任务、历史任务）
- [x] 5.2 改造 ResultPage 为 TaskDetailPage.tsx：从数据库加载结果展示
- [x] 5.3 重构 App.tsx 页面导航：taskList → taskDetail
- [x] 5.4 移除旧的 UploadPage 和 ProcessingPage（功能合并到 TaskListPage）

## 6. 测试

- [x] 6.1 测试添加单个文件并处理
- [x] 6.2 测试添加多个文件排队处理
- [x] 6.3 测试历史任务查看
- [x] 6.4 测试删除任务
- [x] 6.5 测试应用重启后历史任务保留
