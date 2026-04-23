## 1. 数据库 Schema 更新

- [x] 1.1 在 database.ts 中创建 managed_files 表（id, filePath, fileSize, mimeType, createdAt, lastAccessedAt）
- [x] 1.2 在 database.ts 中创建 file_references 表（id, fileId, ownerId, ownerType, createdAt）
- [x] 1.3 为 file_references 创建索引（idx_file_references_owner, idx_file_references_file）
- [x] 1.4 为 tasks 表添加 fileId 列（TEXT, nullable）
- [x] 1.5 为 realtime_recordings 表添加 fileId 列（TEXT, nullable）

## 2. FileManager 服务实现

- [x] 2.1 创建 src/main/services/fileManager.ts 文件
- [x] 2.2 实现 FileManager 单例类结构
- [x] 2.3 实现 registerFile() 方法（注册新文件，返回 fileId）
- [x] 2.4 实现 addReference() 方法（为已存在文件添加引用）
- [x] 2.5 实现 removeReference() 方法（移除引用，不删文件）
- [x] 2.6 实现 getFile() 方法（通过 fileId 获取文件信息）
- [x] 2.7 实现 getFileByOwner() 方法（通过 ownerId 和 ownerType 获取文件）
- [x] 2.8 实现 getReferences() 方法（获取文件的所有引用）
- [x] 2.9 实现 cleanupOrphanFiles() 方法（删除无引用的文件）
- [x] 2.10 实现 verifyIntegrity() 方法（检查文件完整性）

## 3. 数据迁移逻辑

- [x] 3.1 在 database.ts 的 getDb() 中添加迁移检查逻辑
- [x] 3.2 实现 migrateRealtimeRecordings() 函数（扫描并注册现有录音文件）
- [x] 3.3 实现 migrateTasks() 函数（扫描并注册现有任务文件）
- [x] 3.4 处理共享文件场景（同一 filePath 被多个记录引用）
- [x] 3.5 添加迁移日志输出（成功/失败统计）

## 4. 重构录音创建流程

- [x] 4.1 修改 recordingHandlers.ts 的 save-realtime-recording handler
- [x] 4.2 调用 FileManager.registerFile() 注册录音文件
- [x] 4.3 保存 fileId 到 realtime_recordings 表
- [x] 4.4 移除 recordingHandlers.ts 中删除录音时的文件检查逻辑
- [x] 4.5 删除录音时调用 FileManager.removeReference()

## 5. 重构任务创建和删除流程

- [x] 5.1 修改 taskHandlers.ts 的 create-task handler（上传文件场景）
- [x] 5.2 调用 FileManager.registerFile() 注册上传的文件
- [x] 5.3 修改从录音创建任务的逻辑，调用 FileManager.addReference()
- [x] 5.4 移除 database.ts 的 deleteTask() 中的文件删除逻辑
- [x] 5.5 修改 taskHandlers.ts 的 delete-task handler，调用 FileManager.removeReference()
- [x] 5.6 移除 taskHandlers.ts 中删除任务时的文件检查逻辑

## 6. 前端适配

- [x] 6.1 添加 IPC handler: get-file-path（通过 fileId 获取 filePath）
- [x] 6.2 修改 TaskDetailPage.tsx，通过 fileId 获取文件路径
- [x] 6.3 修改 RealtimeRecordingDetailPage.tsx，通过 fileId 获取文件路径
- [x] 6.4 更新 preload.ts 添加 getFilePath 接口

## 7. 应用启动集成

- [x] 7.1 在 index.ts 的 app.whenReady() 中调用 FileManager.cleanupOrphanFiles()
- [x] 7.2 添加清理结果日志输出

## 8. 测试和验证

- [ ] 8.1 测试新建实时录音，验证文件注册和引用创建
- [ ] 8.2 测试从录音创建精校任务，验证引用添加
- [ ] 8.3 测试删除任务，验证文件保留（录音仍存在）
- [ ] 8.4 测试删除录音，验证文件保留（任务仍存在）
- [ ] 8.5 测试删除所有引用后，验证孤儿文件清理
- [ ] 8.6 测试数据迁移（使用旧版本数据库）
- [ ] 8.7 测试文件完整性检查功能
