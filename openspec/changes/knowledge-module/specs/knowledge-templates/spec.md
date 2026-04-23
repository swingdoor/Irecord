## ADDED Requirements

### Requirement: 预设模板
系统 SHALL 内置 5 个提示词模板，builtin=1，不可删除不可编辑。

#### Scenario: 预设模板列表
- **WHEN** 用户打开模板选择或模板管理
- **THEN** 系统展示 5 个预设模板：会议纪要、学习笔记、周报总结、访谈整理、自由整理

#### Scenario: 预设模板不可修改
- **WHEN** 用户查看预设模板
- **THEN** 系统仅展示模板名称和 prompt 内容，不提供编辑和删除操作

### Requirement: 自定义模板 CRUD
系统 SHALL 支持用户创建、编辑、删除自定义模板（builtin=0）。

#### Scenario: 新建自定义模板
- **WHEN** 用户在模板管理弹窗中点击"新建模板"，填写名称和 prompt，点击保存
- **THEN** 系统将模板存入 knowledge_templates 表，builtin=0

#### Scenario: 编辑自定义模板
- **WHEN** 用户点击自定义模板的"编辑"按钮，修改名称或 prompt，点击保存
- **THEN** 系统更新模板记录

#### Scenario: 删除自定义模板
- **WHEN** 用户点击自定义模板的"删除"按钮并确认
- **THEN** 系统删除模板记录

### Requirement: 模板管理弹窗
系统 SHALL 提供模板管理弹窗，集中管理所有模板。

#### Scenario: 打开模板管理
- **WHEN** 用户在新建文档弹窗中点击"管理模板"
- **THEN** 系统弹出模板管理 Modal，列出所有预设和自定义模板，预设模板标记 [预设] 标签

### Requirement: 模板数据存储
系统 SHALL 在 SQLite 数据库中新增 knowledge_templates 表，应用启动时自动初始化预设模板。

#### Scenario: 首次启动初始化
- **WHEN** 应用首次启动，knowledge_templates 表为空
- **THEN** 系统自动插入 5 条预设模板记录（builtin=1）

#### Scenario: 数据结构
- **WHEN** 模板被创建或更新
- **THEN** 系统持久化 id、name、prompt、builtin、createdAt、updatedAt 到 knowledge_templates 表
