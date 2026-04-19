## ADDED Requirements

### Requirement: 任务持久化存储
系统 SHALL 使用 SQLite 数据库持久化存储任务元数据和识别结果。

#### Scenario: 创建任务记录
- **WHEN** 用户添加音频文件
- **THEN** 系统在 tasks 表中创建一条记录，状态为 pending

#### Scenario: 保存识别结果
- **WHEN** 识别完成
- **THEN** 系统更新 tasks 表状态为 completed，并在 results 表中保存识别结果（text, segments, keywords 等）

#### Scenario: 查询历史任务
- **WHEN** 用户打开任务列表页
- **THEN** 系统从数据库读取所有任务，按创建时间倒序排列

### Requirement: 数据库初始化
系统 SHALL 在首次启动时自动创建数据库文件和表结构。

#### Scenario: 首次启动
- **WHEN** 应用首次启动且数据库文件不存在
- **THEN** 系统在用户数据目录创建 tasks.db 文件，并执行建表 SQL
