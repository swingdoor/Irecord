## Why

iRecord 当前只有"录音→转写→查看"的单向流程，转写结果以单条记录孤立存在，无法跨录音聚合整理。用户在生活和办公场景中需要将多条录音内容整合为结构化文档（会议纪要、学习笔记、周报等），目前只能手动复制粘贴。新增知识整理模块，让转写结果从"记录"变成"可编辑的知识文档"。

## What Changes

- 新增"知识整理"Tab 页，与"实时录音"、"文件上传"并列
- 支持多选已有的实时录音和文件转写结果作为素材
- 提供预设提示词模板（会议纪要、学习笔记、周报总结、访谈整理、自由整理），通过 LLM 生成结构化 Markdown 文档
- 支持用户自定义提示词模板，通过弹窗管理（新建、编辑、删除）
- 集成 TipTap 富文本编辑器，支持所见即所得编辑
- 支持局部润色：选中文字后通过浮动工具栏调用 LLM 进行润色、改写、扩写，展示对比后用户确认替换
- 支持导出 Markdown、TXT、PDF 三种格式
- 文档列表支持搜索、表格/卡片视图切换（与现有列表风格一致）
- 支持已有的 default/monochrome 双主题

## Capabilities

### New Capabilities
- `knowledge-docs`: 知识文档的创建、编辑、存储、列表展示、删除
- `knowledge-templates`: 提示词模板管理（预设 + 自定义 CRUD）
- `doc-generation`: 多源素材聚合 + LLM 生成文档 + 局部润色
- `doc-export`: 文档导出（Markdown、TXT、PDF）

### Modified Capabilities

（无现有 spec 需要修改）

## Impact

- 数据库：新增 `knowledge_docs` 和 `knowledge_templates` 两张表
- 依赖：新增 `@tiptap/react`、`@tiptap/starter-kit` 等 TipTap 相关包
- IPC：新增知识文档和模板相关的 handler（knowledgeHandlers.ts）
- LLM：新增文档生成 prompt 和润色 prompt
- 页面：新增 KnowledgeTable 组件、KnowledgeDetailPage 页面、CreateDocModal、TemplateManagerModal、TipTapEditor 组件
- 状态管理：appStore 扩展 knowledge 相关状态和 AppPage 类型
- preload：扩展 electronAPI 接口
