## Context

当前系统中，音频文件的生命周期管理分散在多个模块：
- `database.ts` 的 `deleteTask()` 直接删除 recordings 目录下的文件
- `recordingHandlers.ts` 删除录音时检查任务是否在用（通过字符串路径比较）
- `taskHandlers.ts` 删除任务时检查录音是否在用（通过字符串路径比较）

这导致两个核心问题：
1. **双向检查逻辑复杂且脆弱**：路径比较可能因大小写、格式差异失败
2. **所有权不明确**：无法可靠追踪哪些记录在使用哪个文件

实际 bug：删除精校任务后，`database.ts` 的 `deleteTask()` 无条件删除文件，导致实时录音详情页无法播放。

## Goals / Non-Goals

**Goals:**
- 建立清晰的文件所有权模型（引用计数）
- 统一文件生命周期管理（注册、引用、清理）
- 消除路径字符串比较，改用 ID 关联
- 自动迁移现有数据，无需手动操作
- 删除操作永远安全（不会误删被引用的文件）

**Non-Goals:**
- 文件内容去重（音频文件不会重复）
- 文件版本管理
- 云存储集成
- 文件加密

## Decisions

### Decision 1: 引用计数 vs 软删除

**选择：引用计数（reference counting）**

**方案对比：**
- **引用计数**：新增 `file_references` 表，记录每个所有者对文件的引用
  - 优点：精确追踪，支持多对多关系，易于查询"谁在用这个文件"
  - 缺点：需要两张表，稍微增加复杂度
- **软删除**：删除时不删文件，定期扫描孤儿
  - 优点：实现简单
  - 缺点：无法实时知道文件是否被引用，磁盘空间延迟释放

**理由：** 引用计数提供精确的所有权模型，便于调试和审计。虽然增加一张表，但逻辑更清晰。

### Decision 2: 数据库表结构

**选择：两张表 `managed_files` + `file_references`**

```sql
CREATE TABLE managed_files (
  id TEXT PRIMARY KEY,
  filePath TEXT NOT NULL UNIQUE,
  fileSize INTEGER NOT NULL,
  mimeType TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  lastAccessedAt TEXT NOT NULL
);

CREATE TABLE file_references (
  id TEXT PRIMARY KEY,
  fileId TEXT NOT NULL,
  ownerId TEXT NOT NULL,
  ownerType TEXT NOT NULL,  -- 'task' | 'recording'
  createdAt TEXT NOT NULL,
  FOREIGN KEY (fileId) REFERENCES managed_files(id) ON DELETE CASCADE
);

CREATE INDEX idx_file_references_owner ON file_references(ownerId, ownerType);
CREATE INDEX idx_file_references_file ON file_references(fileId);
```

**理由：**
- `managed_files` 存储文件元数据，`filePath` 唯一索引防止重复注册
- `file_references` 存储引用关系，支持多对多
- `ON DELETE CASCADE` 确保删除文件时自动清理引用
- 索引优化查询性能（通过 owner 查文件、通过文件查 owner）

### Decision 3: FileManager 作为单例服务

**选择：单例类 + 静态方法**

```typescript
class FileManager {
  private static instance: FileManager | null = null
  
  static getInstance(): FileManager {
    if (!this.instance) this.instance = new FileManager()
    return this.instance
  }
  
  async registerFile(...): Promise<string>
  async addReference(...): Promise<void>
  async removeReference(...): Promise<void>
  async cleanupOrphanFiles(): Promise<void>
}
```

**理由：**
- 文件管理是全局关注点，单例避免多实例冲突
- 静态方法便于在各模块中调用
- 内部维护数据库连接，避免重复初始化

### Decision 4: 迁移策略

**选择：数据库初始化时自动迁移**

**流程：**
1. 检查 `tasks` 和 `realtime_recordings` 表是否有 `fileId` 列
2. 如果没有，执行 `ALTER TABLE` 添加列
3. 扫描所有 `fileId IS NULL` 的记录
4. 对每条记录：
   - 检查 `filePath` 是否已在 `managed_files` 中（可能被其他记录注册过）
   - 如果没有，注册文件
   - 创建 `file_references` 记录
   - 更新记录的 `fileId`

**理由：**
- 用户无感知，首次启动自动完成
- 幂等操作，可重复执行
- 保留 `filePath` 字段作为冗余，便于调试和回滚

### Decision 5: 孤儿文件清理时机

**选择：应用启动时 + 手动触发**

**理由：**
- 启动时清理：确保每次运行都是干净状态
- 不用定时任务：避免后台线程复杂度
- 手动触发：提供管理员控制（未来可加 UI）

## Risks / Trade-offs

### Risk 1: 迁移失败导致数据不一致
**场景：** 迁移过程中应用崩溃，部分记录已迁移，部分未迁移

**缓解：**
- 迁移逻辑幂等，可重复执行
- 保留 `filePath` 字段，回退时可用
- 迁移前备份数据库（用户手动或文档提示）

### Risk 2: 文件路径变化导致引用失效
**场景：** 用户手动移动 recordings 目录下的文件

**缓解：**
- `verifyIntegrity()` 方法检测文件缺失
- 未来可考虑相对路径或符号链接

### Risk 3: 性能影响
**场景：** 每次删除操作都查询引用表

**缓解：**
- 索引优化查询（`idx_file_references_file`）
- 删除操作本身不频繁
- 实测：SQLite 查询几千条记录 <10ms

### Trade-off: 增加存储开销
**影响：** 每个文件多存储一条 `managed_files` 记录（~200 bytes）

**接受理由：** 存储成本可忽略，换来的是可靠性和可维护性

## Migration Plan

**阶段 1: 数据库 schema 更新（自动）**
1. 应用启动时检测 schema 版本
2. 创建 `managed_files` 和 `file_references` 表
3. 为 `tasks` 和 `realtime_recordings` 添加 `fileId` 列

**阶段 2: 数据迁移（自动）**
1. 扫描所有 `fileId IS NULL` 的记录
2. 注册文件并建立引用
3. 更新 `fileId` 字段

**阶段 3: 代码切换（一次性部署）**
1. 所有创建文件的地方调用 `FileManager.registerFile()`
2. 所有删除记录的地方调用 `FileManager.removeReference()`
3. 移除旧的文件删除逻辑

**回滚策略：**
- 保留 `filePath` 字段，回滚时可用
- 删除 `managed_files` 和 `file_references` 表
- 恢复旧的删除逻辑

## Open Questions

无
