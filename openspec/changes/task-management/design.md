## Context

当前应用是单任务流程：上传页 → 处理中 → 结果页，状态全部存在内存中（Zustand），关闭或返回后数据丢失。需要改造为多任务架构，支持任务队列和持久化。

## Goals / Non-Goals

**Goals:**
- 任务列表作为应用主页
- 支持添加多个文件，自动排队处理
- 任务状态持久化（SQLite）
- 历史任务可随时查看结果

**Non-Goals:**
- 并行处理多个任务（当前 CPU 资源有限，串行处理）
- 任务编辑/重新处理
- 云端同步

## Decisions

### 1. 使用 better-sqlite3 做本地存储

**决策**：使用 `better-sqlite3` 存储任务元数据和识别结果。

**理由**：
- 同步 API，简单直接
- 单文件数据库，易于管理
- 性能足够（任务量不大）

**备选方案**：
- ❌ JSON 文件：并发写入不安全，查询不便
- ❌ IndexedDB：只能在渲染进程使用

### 2. 数据库表结构

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  fileName TEXT NOT NULL,
  filePath TEXT NOT NULL,
  fileSize INTEGER,
  duration REAL,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | processing | completed | failed
  strategy TEXT,
  error TEXT,
  createdAt TEXT NOT NULL,
  completedAt TEXT,
  processingTime REAL
);

CREATE TABLE results (
  taskId TEXT PRIMARY KEY REFERENCES tasks(id),
  text TEXT,
  segments TEXT,       -- JSON
  speakerStats TEXT,   -- JSON
  keywords TEXT,       -- JSON
  lang TEXT
);
```

### 3. 页面结构重构

```
TaskListPage (主页)
  ├─ 添加文件按钮
  ├─ 进行中的任务（状态 + 用时）
  └─ 已完成的任务列表（点击进入详情）

TaskDetailPage (详情页 = 原 ResultPage 改造)
  ├─ 从数据库读取结果
  └─ 复用现有的说话人/关键词/导出功能
```

### 4. 任务队列处理

**决策**：串行处理，一个任务完成后自动开始下一个。

**流程**：
1. 用户添加文件 → 创建 pending 任务
2. 队列检查：如果没有 processing 任务 → 取最早的 pending 任务开始处理
3. 处理完成 → 更新状态为 completed，保存结果到 results 表
4. 自动检查队列，处理下一个

## Risks / Trade-offs

### 1. better-sqlite3 是 native addon
**风险**：和 sherpa-onnx-node 一样，在 Electron 主进程中可能有 external buffer 问题。
**缓解**：better-sqlite3 不使用 external buffer，可以直接在主进程中使用。

### 2. 大量历史数据
**风险**：长期使用后数据库可能变大。
**缓解**：识别结果中 segments 是 JSON 字符串，单条记录不会太大。后续可加清理功能。
