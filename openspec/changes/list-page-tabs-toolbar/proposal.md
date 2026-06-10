## Why

`fix-page-layout-scroll` 修复了页面整体高度链，但 TaskListPage 的工具栏布局还有几处需要收尾：(1) 搜索框 + 列表/卡片切换占了独立一行，与 Tab 标签栏分开，浪费纵向空间；(2) 知识整理列表下方既有「新建文档」又有「管理模板」按钮，与顶部 FeatureCards 的「知识整理」卡片职责重叠；(3) 表格视图下分页器看不见（卡片视图能看到）——这是 antd v6 Tabs 内部 `.ant-tabs-content-holder` / `.ant-tabs-content` 默认无 `height: 100%`，导致 TabPane 的 `height:100%` 失效，Table 自然撑高把分页器顶出视口的 bug。

## What Changes

- **同行布局**：TaskListPage 把搜索框 + 列表/卡片切换 Segmented 用 antd Tabs 的 `tabBarExtraContent` 塞到 Tab 标签栏右侧，三者并列同一行，去掉原来独立的搜索栏 div。顺带把 `Tabs.TabPane` 改写为新的 `items` prop（消除 antd v6 弃用警告）。
- **KnowledgeTable 工具栏简化**：删除「新建文档」按钮（FeatureCards 的"知识整理"卡片承担此入口）；删除「管理模板」按钮（移到 FeatureCards 知识整理卡片右上角）；删除 `onCreateNew` prop 与卡片内 TemplateManagerModal 渲染。批量操作（删除/导出）保留。
- **FeatureCards 知识整理卡片**：右上角新增「管理模板」按钮，`type="text"` 无边框样式；FeatureCards 增加 `onManageTemplates` prop。
- **TemplateManagerModal 提升**：从 KnowledgeTable 内提升到 TaskListPage（与 SettingsModal/CreateDocModal 同级），由父级控制 open 状态。
- **修复表格视图分页器消失（BUG）**：`index.css` 增加 antd Tabs 高度链补丁——`.ant-tabs-content-holder { height: 100%; overflow: hidden }` / `.ant-tabs-content { height: 100% }` / `.ant-tabs-tabpane { height: 100%; overflow: hidden }`，让内部表格被 `overflow:hidden` 收住，分页器稳定可见。

## Capabilities

### New Capabilities
（无）

### Modified Capabilities
- `app-shell-layout`: 新增对 antd Tabs 内部高度链的强制约束（CSS 补丁），保证「页面框架不滚动、内部区域按需滚动」契约在 Tabs 内仍成立；明确 TaskListPage 工具栏布局为「Tab 栏 + 同行 tabBarExtraContent（搜索 + 视图切换）」；明确分页器在所有 tab 与视图模式下均稳定可见的要求。

## Impact

- **样式**：`src/renderer/src/styles/index.css` 增加 antd Tabs 内部高度链补丁。
- **页面**：`TaskListPage.tsx` 改写 Tabs 为 items + tabBarExtraContent；提升 `templateModalOpen` 状态与 `TemplateManagerModal` 渲染。
- **组件**：
  - `FeatureCards.tsx` 知识整理卡片右上角加「管理模板」按钮（type="text"），增加 `onManageTemplates` prop。
  - `KnowledgeTable.tsx` 删除「新建文档」「管理模板」按钮、`onCreateNew` prop、TemplateManagerModal 渲染与 `templateModalOpen` 状态。
- **依赖**：无新增。
- **不影响**：业务逻辑、数据流、IPC、分页/搜索的数据计算（仅 UI 重组与 CSS 补丁）。
- **风险**：低。CSS 补丁有可能影响其他使用 `<Tabs>` 的页面外观——但本项目目前仅 TaskListPage 与 AiPanel 使用，且 AiPanel 的 Tabs 已有自己的样式控制（`ai-panel-tabs` 类名），互不冲突。
