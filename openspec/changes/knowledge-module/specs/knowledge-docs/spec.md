## ADDED Requirements

### Requirement: 知识文档列表展示
系统 SHALL 在主页新增"知识整理"Tab，展示所有知识文档列表，支持表格和卡片两种视图切换，支持按标题搜索。

#### Scenario: 表格视图展示
- **WHEN** 用户切换到"知识整理"Tab
- **THEN** 系统以表格形式展示文档列表，列包含：标题、模板名称、来源数量、创建时间、操作

#### Scenario: 卡片视图展示
- **WHEN** 用户切换到卡片视图
- **THEN** 系统以卡片形式展示文档，每张卡片显示标题、模板名称、来源文件名、创建时间

#### Scenario: 搜索文档
- **WHEN** 用户在搜索框输入关键词
- **THEN** 系统按标题过滤文档列表，实时显示匹配结果

### Requirement: 创建知识文档
系统 SHALL 提供新建文档入口，用户通过弹窗选择素材和模板后生成文档。

#### Scenario: 打开新建弹窗
- **WHEN** 用户点击"新建文档"按钮
- **THEN** 系统弹出 Modal，展示所有实时录音和文件转写记录（仅已完成的），支持勾选

#### Scenario: 选择素材并生成
- **WHEN** 用户勾选至少一条录音/转写记录，选择模板，点击"生成文档"
- **THEN** 系统将选中素材的转写文本拼接，结合模板 prompt 调用 LLM，生成 Markdown 文档并跳转到编辑页

#### Scenario: 未选择素材
- **WHEN** 用户未勾选任何素材就点击"生成文档"
- **THEN** 系统提示"请至少选择一条录音或转写记录"

### Requirement: 编辑知识文档
系统 SHALL 提供文档编辑页，使用 TipTap 富文本编辑器，支持所见即所得编辑。

#### Scenario: 进入编辑页
- **WHEN** 用户点击文档列表中的某条文档
- **THEN** 系统跳转到文档编辑页，显示标题（可编辑）、来源文件名列表、模板名称、TipTap 编辑器加载文档内容

#### Scenario: 编辑并保存
- **WHEN** 用户修改文档内容后点击"保存"
- **THEN** 系统将编辑器内容保存到数据库，更新 updatedAt 时间戳

### Requirement: 删除知识文档
系统 SHALL 支持删除知识文档，删除前需确认。

#### Scenario: 删除文档
- **WHEN** 用户在操作菜单中点击"删除"
- **THEN** 系统弹出确认弹窗，用户确认后删除文档记录

### Requirement: 知识文档数据存储
系统 SHALL 在 SQLite 数据库中新增 knowledge_docs 表存储文档数据。

#### Scenario: 数据持久化
- **WHEN** 文档被创建或更新
- **THEN** 系统将 id、title、content（Markdown）、templateId、sourceIds（JSON）、createdAt、updatedAt 持久化到 knowledge_docs 表

#### Scenario: 来源引用展示
- **WHEN** 用户查看文档详情
- **THEN** 系统根据 sourceIds 查询对应的录音标题或文件名称，在页面上展示来源列表
