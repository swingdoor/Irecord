## Why

当前音频文件的生命周期管理散落在 `database.ts`、`taskHandlers.ts`、`recordingHandlers.ts` 多处，通过字符串路径比较判断文件是否被引用，导致删除任务后实时录音的音频文件丢失。根本原因是文件没有独立的所有权模型，业务记录直接操作文件系统，无法可靠追踪谁在使用哪个文件。

## What Changes

- **BREAKING** 新增 `FileManager` 服务，统一管理音频文件的注册、引用和清理
- **BREAKING** 新增 `managed_files` 和 `file_references` 数据库表
- **BREAKING** `Task` 和 `RealtimeRecording` 表新增 `fileId` 字段，替代直接使用 `filePath`
- 删除 `database.ts` 中 `deleteTask` 的文件删除逻辑
- 删除 `recordingHandlers.ts` 和 `taskHandlers.ts` 中的文件引用检查逻辑
- 删除任务/录音时只移除引用，不直接操作文件
- 应用启动时自动清理无引用的孤儿文件
- 数据库初始化时自动迁移现有数据（扫描现有记录，注册文件并建立引用）

## Capabilities

### New Capabilities
- `file-lifecycle`: 文件注册、引用计数、孤儿清理的完整生命周期管理
- `file-migration`: 现有数据自动迁移到新的文件管理模型

### Modified Capabilities

## Impact

**新增文件:**
- `src/main/services/fileManager.ts` — FileManager 服务

**重构文件:**
- `src/main/db/database.ts` — 新增表、迁移逻辑、移除 deleteTask 中的文件删除
- `src/main/ipc/taskHandlers.ts` — 删除任务时调用 FileManager.removeReference
- `src/main/ipc/recordingHandlers.ts` — 保存/删除录音时调用 FileManager
- `src/main/index.ts` — 启动时调用孤儿文件清理
- `src/renderer/src/pages/TaskDetailPage.tsx` — 通过 fileId 获取文件路径
- `src/renderer/src/pages/RealtimeRecordingDetailPage.tsx` — 同上
