## 1. 数据库和数据模型

- [ ] 1.1 在 src/main/db/database.ts 中新增 knowledge_docs 表（id, title, content, templateId, sourceIds, createdAt, updatedAt）
- [ ] 1.2 在 src/main/db/database.ts 中新增 knowledge_templates 表（id, name, prompt, builtin, createdAt, updatedAt）
- [ ] 1.3 实现 knowledge_docs 的 CRUD 方法（createKnowledgeDoc, getKnowledgeDoc, getAllKnowledgeDocs, updateKnowledgeDoc, deleteKnowledgeDoc）
- [ ] 1.4 实现 knowledge_templates 的 CRUD 方法（createTemplate, getTemplate, getAllTemplates, updateTemplate, deleteTemplate）
- [ ] 1.5 实现应用启动时初始化 5 个预设模板的逻辑（builtin=1）

## 2. LLM Prompt 和生成逻辑

- [ ] 2.1 在 src/main/llm/prompts.ts 中新增 5 个预设模板的 prompt 函数（会议纪要、学习笔记、周报总结、访谈整理、自由整理）
- [ ] 2.2 在 src/main/llm/prompts.ts 中新增局部润色的 prompt 函数（润色、改写、扩写）
- [ ] 2.3 实现文档生成逻辑：根据 sourceIds 查询转写文本，按时间排序拼接，结合模板 prompt 调用 LLM

## 3. IPC Handlers

- [ ] 3.1 创建 src/main/ipc/knowledgeHandlers.ts
- [ ] 3.2 实现 createKnowledgeDoc handler（接收 sourceIds + templateId，生成文档并返回 docId）
- [ ] 3.3 实现 getKnowledgeDocs handler（返回所有文档列表）
- [ ] 3.4 实现 getKnowledgeDoc handler（根据 docId 返回文档详情）
- [ ] 3.5 实现 updateKnowledgeDoc handler（更新 title 和 content）
- [ ] 3.6 实现 deleteKnowledgeDoc handler（删除文档）
- [ ] 3.7 实现 getTemplates handler（返回所有模板）
- [ ] 3.8 实现 createTemplate handler（创建自定义模板）
- [ ] 3.9 实现 updateTemplate handler（更新自定义模板）
- [ ] 3.10 实现 deleteTemplate handler（删除自定义模板）
- [ ] 3.11 实现 polishText handler（接收选中文字 + 操作类型，调用 LLM 返回润色结果）
- [ ] 3.12 实现 exportMarkdown handler（保存 Markdown 文件）
- [ ] 3.13 实现 exportTxt handler（保存纯文本文件）
- [ ] 3.14 实现 exportPdf handler（使用 printToPDF 生成 PDF）
- [ ] 3.15 在 src/main/ipc/index.ts 中注册 knowledgeHandlers

## 4. Preload API

- [ ] 4.1 在 src/preload/index.ts 中新增 knowledge 相关接口（createKnowledgeDoc, getKnowledgeDocs, getKnowledgeDoc, updateKnowledgeDoc, deleteKnowledgeDoc）
- [ ] 4.2 在 src/preload/index.ts 中新增 template 相关接口（getTemplates, createTemplate, updateTemplate, deleteTemplate）
- [ ] 4.3 在 src/preload/index.ts 中新增 polishText 接口
- [ ] 4.4 在 src/preload/index.ts 中新增导出接口（exportKnowledgeMarkdown, exportKnowledgeTxt, exportKnowledgePdf）

## 5. 状态管理

- [ ] 5.1 在 src/renderer/src/stores/appStore.ts 中扩展 AppPage 类型，新增 'knowledge' 和 'knowledgeDetail'
- [ ] 5.2 在 appStore 中新增 knowledgeDocs 状态和 refreshKnowledgeDocs 方法
- [ ] 5.3 在 appStore 中新增 currentKnowledgeDocId 和 currentKnowledgeDoc 状态
- [ ] 5.4 在 appStore 中新增 templates 状态和 refreshTemplates 方法

## 6. 依赖安装

- [ ] 6.1 安装 TipTap 相关依赖（@tiptap/react, @tiptap/starter-kit, @tiptap/extension-underline, @tiptap/extension-placeholder）
- [ ] 6.2 安装 Markdown 转换依赖（turndown, marked, @types/turndown, @types/marked）

## 7. TipTap 编辑器组件

- [ ] 7.1 创建 src/renderer/src/components/TipTapEditor.tsx
- [ ] 7.2 实现 TipTap 编辑器初始化（StarterKit + Underline + Placeholder）
- [ ] 7.3 实现工具栏（使用 AntD Button + Space + Divider，包含：粗体、斜体、下划线、标题、列表、引用、代码块）
- [ ] 7.4 实现 BubbleMenu 浮动工具栏（选中文字时显示润色/改写/扩写按钮）
- [ ] 7.5 实现润色结果对比 Popover（展示原文 vs 结果，提供采用/放弃/重新生成操作）
- [ ] 7.6 实现 Markdown 加载（marked 转 HTML 设置到编辑器）
- [ ] 7.7 实现 Markdown 导出（turndown 转换编辑器内容）
- [ ] 7.8 适配 default 和 monochrome 双主题样式

## 8. 知识文档列表组件

- [ ] 8.1 创建 src/renderer/src/components/KnowledgeTable.tsx
- [ ] 8.2 实现搜索框（AntD Input，按标题过滤）
- [ ] 8.3 实现表格/卡片视图切换（AntD Segmented）
- [ ] 8.4 实现表格视图（列：标题、模板、来源数、时间、操作）
- [ ] 8.5 实现卡片视图（显示标题、模板、来源文件名、时间）
- [ ] 8.6 实现操作菜单（导出 Markdown、导出 TXT、导出 PDF、删除）
- [ ] 8.7 实现删除确认弹窗
- [ ] 8.8 实现"新建文档"按钮，点击打开 CreateDocModal

## 9. 新建文档弹窗

- [ ] 9.1 创建 src/renderer/src/components/CreateDocModal.tsx
- [ ] 9.2 实现素材选择区（分组展示实时录音和文件转写，使用 Checkbox.Group）
- [ ] 9.3 实现模板选择（AntD Select，列出所有模板）
- [ ] 9.4 实现"管理模板"按钮，点击打开 TemplateManagerModal
- [ ] 9.5 实现"生成文档"按钮，调用 createKnowledgeDoc，显示 loading 状态
- [ ] 9.6 生成成功后跳转到文档编辑页

## 10. 模板管理弹窗

- [ ] 10.1 创建 src/renderer/src/components/TemplateManagerModal.tsx
- [ ] 10.2 实现模板列表（预设模板标记 [预设] 标签，自定义模板显示编辑/删除按钮）
- [ ] 10.3 实现"新建模板"按钮和表单（名称 + prompt 输入框）
- [ ] 10.4 实现编辑模板表单（点击编辑按钮展开表单）
- [ ] 10.5 实现删除模板确认
- [ ] 10.6 实现保存逻辑（调用 createTemplate 或 updateTemplate）

## 11. 文档编辑页

- [ ] 11.1 创建 src/renderer/src/pages/KnowledgeDetailPage.tsx
- [ ] 11.2 实现页面布局（返回按钮、标题输入框、来源展示、模板展示、TipTapEditor、导出按钮）
- [ ] 11.3 实现根据 currentKnowledgeDocId 加载文档数据
- [ ] 11.4 实现根据 sourceIds 查询并展示来源文件名列表
- [ ] 11.5 实现标题编辑和自动保存（debounce）
- [ ] 11.6 实现内容编辑和保存按钮
- [ ] 11.7 实现导出 Markdown 按钮（调用 exportKnowledgeMarkdown）
- [ ] 11.8 实现导出 TXT 按钮（调用 exportKnowledgeTxt）
- [ ] 11.9 实现导出 PDF 按钮（调用 exportKnowledgePdf）

## 12. 主页集成

- [ ] 12.1 在 src/renderer/src/pages/TaskListPage.tsx 中新增"知识整理"Tab
- [ ] 12.2 在 Tab 内容区渲染 KnowledgeTable 组件
- [ ] 12.3 在 src/renderer/src/App.tsx 中新增 knowledgeDetail 页面路由

## 13. 测试和验证

- [ ] 13.1 验证新建文档流程（选择素材 → 选择模板 → 生成 → 跳转编辑页）
- [ ] 13.2 验证编辑和保存功能
- [ ] 13.3 验证局部润色功能（选中文字 → 润色 → 对比 → 采用）
- [ ] 13.4 验证模板管理（新建、编辑、删除自定义模板）
- [ ] 13.5 验证导出功能（Markdown、TXT、PDF）
- [ ] 13.6 验证搜索和视图切换
- [ ] 13.7 验证删除文档
- [ ] 13.8 验证双主题适配
- [ ] 13.9 验证来源录音被删除后的展示（显示"已删除"）
