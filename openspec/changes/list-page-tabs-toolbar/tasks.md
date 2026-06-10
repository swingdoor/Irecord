## 1. CSS 修复 antd Tabs 内部高度链

- [x] 1.1 `src/renderer/src/styles/index.css` 增加 antd Tabs 内部高度链补丁：
  ```css
  .ant-tabs-content-holder { height: 100%; overflow: hidden; }
  .ant-tabs-content { height: 100%; }
  .ant-tabs-tabpane { height: 100%; overflow: hidden; }
  ```
- [x] 1.2 编译验证 `npm run build`

## 2. TaskListPage：Tabs 重构为 items + tabBarExtraContent

- [x] 2.1 将 `Tabs.TabPane` 写法改为 antd v6 推荐的 `items` 数组形式（消除弃用警告）
- [x] 2.2 把搜索 `<Input>` 与「列表/卡片」`<Segmented>` 移入 `tabBarExtraContent`（默认靠右），删除原独立的搜索栏 `<div>`
- [x] 2.3 搜索框宽度从 `300px` 调整为 `240px`（适配 Tab 栏右侧空间）
- [x] 2.4 占位符根据 `activeTab` 动态显示「搜索录音/文件/文档...」（保留现有逻辑）
- [x] 2.5 切 tab 时清空 `searchTerm`、重置 `currentPage`（保留现有逻辑）
- [x] 2.6 编译验证 `npm run build`

## 3. TaskListPage：提升 TemplateManagerModal

- [x] 3.1 增加状态 `const [templateModalOpen, setTemplateModalOpen] = useState(false)`
- [x] 3.2 在页面底部 `<SettingsModal>` 与 `<CreateDocModal>` 同级渲染 `<TemplateManagerModal open={templateModalOpen} onClose={() => setTemplateModalOpen(false)} />`
- [x] 3.3 给 `<FeatureCards>` 传新 prop `onManageTemplates={() => setTemplateModalOpen(true)}`
- [x] 3.4 编译验证 `npm run build`

## 4. FeatureCards：知识整理卡片右上角加「管理模板」

- [x] 4.1 接口 `FeatureCardsProps` 增加 `onManageTemplates: () => void`
- [x] 4.2 知识整理 `<Card>` 加 `extra={<Button type="text" icon={<SettingOutlined />} onClick={onManageTemplates}>管理模板</Button>}`
- [x] 4.3 import `SettingOutlined`
- [x] 4.4 编译验证 `npm run build`

## 5. KnowledgeTable：移除「新建文档」「管理模板」与 modal

- [x] 5.1 删除工具栏中的「新建文档」按钮渲染
- [x] 5.2 删除工具栏中的「管理模板」按钮渲染
- [x] 5.3 删除 `<TemplateManagerModal>` 渲染与 `templateModalOpen` 状态
- [x] 5.4 删除 props 中的 `onCreateNew`（无调用方后），更新 `KnowledgeTableProps` 与 `TaskListPage` 调用处
- [x] 5.5 删除不再使用的 imports（`SettingOutlined`/`TemplateManagerModal` 等若仅此处引用）
- [x] 5.6 保留批量操作（删除/导出）
- [x] 5.7 编译验证 `npm run build`

## 6. 验证

- [x] 6.1 `npm run build` 全量通过
- [ ] 6.2 `npm run dev` 目测：表格视图下分页器可见（核心 bug 修复）
- [ ] 6.3 三个 tab + 列表/卡片切换下分页器位置完全一致、始终可见
- [ ] 6.4 Tab 栏右侧 = 搜索 + 列表/卡片切换，并列同行
- [ ] 6.5 FeatureCards 知识整理卡片右上角显示「管理模板」按钮，无边框，点击触发 modal
- [ ] 6.6 知识整理列表底部不再有「新建文档」「管理模板」按钮
- [ ] 6.7 控制台无 `Tabs.TabPane` 弃用警告
- [ ] 6.8 AiPanel 内的 Tabs 内部滚动正常（验证全局补丁未误伤）
