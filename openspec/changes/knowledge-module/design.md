## Context

iRecord 是基于 Electron + React + TypeScript 的本地语音转写工具。现有架构：
- 数据库：SQLite (sql.js)，3 张表（tasks、results、realtime_recordings）
- LLM：DashScope API，一次性返回（非流式），自动重试 3 次
- 页面导航：Zustand 状态切换（AppPage 类型），无路由库
- 主题：Ant Design ConfigProvider，default/monochrome 双主题
- IPC：主进程 handler 按模块拆分在 src/main/ipc/ 目录下

知识整理模块需要在此架构上新增文档管理、模板管理、LLM 文档生成、富文本编辑、局部润色、多格式导出能力。

## Goals / Non-Goals

**Goals:**
- 用户可以多选已有录音/转写记录，通过模板生成结构化 Markdown 文档
- 提供所见即所得的富文本编辑体验，支持局部 LLM 润色
- 支持预设 + 自定义提示词模板管理
- 支持 Markdown、TXT、PDF 三种导出格式
- 视觉风格与现有 Ant Design 组件和双主题保持一致

**Non-Goals:**
- 不实现音频引用（不在文档中嵌入音频播放器）
- 不实现协同编辑或多人共享
- 不实现版本历史
- 不实现段落级素材选取（仅整条录音选取）

## Decisions

### 1. 富文本编辑器选型：TipTap

**选择：** TipTap（基于 ProseMirror）

**替代方案：**
- Ant Design Input.TextArea + Markdown 预览：无法实现所见即所得和局部选中润色
- Quill：成熟但架构较老，自定义扩展不如 TipTap 灵活
- Slate：学习曲线陡，需要从零实现大量功能
- Lexical (Meta)：较新，生态不如 TipTap 完善

**理由：**
- TipTap 工具栏可完全用 AntD Button/Space/Divider 搭建，视觉融合度高
- 内置 BubbleMenu 组件天然支持"选中文字→浮动工具栏"的润色交互
- StarterKit 扩展包含标题、列表、粗体、斜体等常用格式，开箱即用
- 支持 Markdown 输入输出（通过 @tiptap/pm 和 turndown/marked 转换）

**依赖清单：**
- `@tiptap/react` — React 绑定
- `@tiptap/starter-kit` — 基础扩展集合
- `@tiptap/extension-underline` — 下划线
- `@tiptap/extension-placeholder` — 占位符
- `turndown` — HTML → Markdown 转换（导出用）
- `marked` — Markdown → HTML 转换（加载文档用）

### 2. 文档存储格式：Markdown

**选择：** 数据库中 content 字段存储 Markdown 格式

**替代方案：**
- 存 HTML：体积大，可读性差
- 存 ProseMirror JSON：与编辑器强耦合，导出需额外转换

**理由：**
- Markdown 是通用格式，导出 .md 零成本
- 加载时通过 marked 转 HTML 给 TipTap，保存时通过 turndown 转回 Markdown
- 用户即使不用编辑器也能直接阅读数据库中的内容

### 3. PDF 导出：Electron printToPDF

**选择：** 使用 Electron BrowserWindow.webContents.printToPDF()

**替代方案：**
- jspdf + html2canvas：需要额外依赖，中文字体支持复杂
- puppeteer：体积过大，不适合桌面应用

**理由：**
- 零额外依赖，Electron 原生支持
- 创建隐藏 BrowserWindow 加载文档 HTML，调用 printToPDF 生成
- 中文渲染由系统字体处理，无需额外配置

### 4. 局部润色交互：TipTap BubbleMenu + Popover

**选择：** 选中文字时显示 BubbleMenu（AntD Button.Group），点击后用 AntD Popover 展示对比结果

**流程：**
1. 用户选中文字 → BubbleMenu 出现（润色/改写/扩写）
2. 点击按钮 → Popover 展示 loading 状态
3. LLM 返回 → Popover 展示原文 vs 结果 + 采用/放弃/重新生成
4. 采用 → 替换选区内容，关闭 Popover

### 5. 模板数据初始化：应用启动时检查

**选择：** 在数据库初始化阶段检查 knowledge_templates 表，若无预设模板则插入

**理由：** 与现有 resetStaleTasks() 等启动逻辑一致，简单可靠

### 6. 页面导航：扩展 AppPage 类型

**选择：** 新增 `'knowledge'`（不需要独立页面，复用主页 Tab）和 `'knowledgeDetail'` 两个页面状态

**理由：** 与现有导航模式一致，知识整理列表作为主页第三个 Tab，文档编辑页作为独立页面

### 7. 新建文档弹窗：Modal + Checkbox 列表

**选择：** AntD Modal 内使用 Checkbox.Group 展示素材列表，Select 选择模板

**替代方案：**
- Transfer 组件：过于复杂，素材数量不大不需要左右穿梭
- 独立页面：打断流程，弹窗更轻量

## Risks / Trade-offs

- [TipTap 包体积 ~150KB] → 可接受，相比 Electron 本身体积可忽略
- [LLM 生成文档耗时较长] → 弹窗中显示 loading 状态，生成完成后自动跳转编辑页
- [来源录音被删除后引用断裂] → 文档内容独立存在不受影响，来源展示时对查不到的 ID 显示"已删除"
- [Markdown ↔ HTML 转换可能丢失部分格式] → 限制编辑器支持的格式为 Markdown 可表达的子集（标题、列表、粗体、斜体、下划线、引用、代码块）
