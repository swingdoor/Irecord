## ADDED Requirements

### Requirement: 嵌套 Tabs 内部高度链完整性
系统 SHALL 在使用 antd `<Tabs>` 的页面内继续保持完整的高度链，使 Tabs 内部内容受父级 `overflow: hidden` 约束、不撑破框架、不顶出固定元素。

#### Scenario: Tabs 内部容器高度约束
- **WHEN** 任一页面在 flex 容器内渲染 antd `<Tabs>` 且其父级 `overflow: hidden`
- **THEN** `.ant-tabs-content-holder` 与 `.ant-tabs-content` 均为 `height: 100%`，使 TabPane 的 `height: 100%` 真正生效

#### Scenario: TabPane 自身约束
- **WHEN** TabPane 内容区渲染
- **THEN** `.ant-tabs-tabpane` 为 `height: 100%; overflow: hidden`，子组件被高度链精确收住、不能自然撑高把外层固定元素挤出视口

#### Scenario: 不影响其他自定义 Tabs
- **WHEN** 其他位置（如 AiPanel）使用具有自定义 className 的 `<Tabs>` 且其内部组件需要内部滚动（`overflow: auto`）
- **THEN** 自定义类的样式因 CSS 特异性更高而覆盖全局补丁，组件原有滚动行为不受影响

### Requirement: 列表页工具栏与 Tab 同行
系统 SHALL 将 TaskListPage 的搜索框、列表/卡片视图切换、Tab 标签栏并列在同一行，节省纵向空间。

#### Scenario: 搜索 + 视图切换位于 Tab 栏右侧
- **WHEN** TaskListPage 渲染
- **THEN** Tab 标签栏左侧是「实时录音 / 文件上传 / 知识整理」三个标签，右侧（通过 antd Tabs `tabBarExtraContent`）依次是搜索输入框与「列表 / 卡片」Segmented 切换器

#### Scenario: 全局搜索与视图状态
- **WHEN** 用户输入搜索词或切换视图模式
- **THEN** 状态全局共享于三个 tab，`tabBarExtraContent` 中的控件值始终反映当前 `searchTerm` 与 `viewMode`

#### Scenario: 切换 Tab 重置
- **WHEN** 用户切换到另一个 tab
- **THEN** 搜索词清空、当前页重置为第 1 页

#### Scenario: 使用 items 写法
- **WHEN** Tabs 渲染
- **THEN** 使用 antd v6 推荐的 `items` 数组形式（不再使用已弃用的 `Tabs.TabPane`），消除 antd v6 弃用警告

### Requirement: 知识整理工具栏精简
系统 SHALL 在 KnowledgeTable 列表底部工具栏移除「新建文档」与「管理模板」按钮，相应入口由 FeatureCards 知识整理卡片承担，避免入口重复与职责重叠。

#### Scenario: 移除新建文档按钮
- **WHEN** KnowledgeTable 渲染
- **THEN** 列表工具栏不显示「新建文档」按钮（该入口由 FeatureCards 知识整理卡片的主按钮承担）

#### Scenario: 移除管理模板按钮
- **WHEN** KnowledgeTable 渲染
- **THEN** 列表工具栏不显示「管理模板」按钮，且 KnowledgeTable 不再渲染 `<TemplateManagerModal>`

#### Scenario: 保留批量操作
- **WHEN** 用户在 KnowledgeTable 选中至少一行
- **THEN** 工具栏显示「批量删除」「批量导出」按钮（保留现有行为）

### Requirement: FeatureCards 知识整理卡片管理模板入口
系统 SHALL 在 FeatureCards 的知识整理卡片右上角提供「管理模板」按钮，作为次要操作入口，样式无边框（`type="text"`）。

#### Scenario: 卡片右上角按钮
- **WHEN** FeatureCards 渲染
- **THEN** 知识整理 `<Card>` 通过 `extra` 槽位显示「管理模板」按钮，按钮 `type="text"` 无边框，附 `<SettingOutlined />` 图标

#### Scenario: 触发模板管理弹窗
- **WHEN** 用户点击「管理模板」按钮
- **THEN** 触发 `onManageTemplates` 回调，TaskListPage 打开 `<TemplateManagerModal>`

#### Scenario: 主次操作层级清晰
- **WHEN** 知识整理卡片渲染
- **THEN** 卡片主按钮「新建文档」（block 主操作）与右上角「管理模板」（无边框次操作）形成视觉层级，职责区分清晰

## MODIFIED Requirements

### Requirement: 列表页分页器位置统一
系统 SHALL 使 TaskListPage 的分页器固定于页面底部靠右，跨三个 tab 与列表/卡片视图位置、大小一致**且始终可见**（不被 Tabs 内部表格内容顶出视口）。

#### Scenario: 分页器固定底部靠右
- **WHEN** 任一 tab（实时录音/文件上传/知识整理）的数据超过一页
- **THEN** 分页器显示在页面底部 `flexShrink: 0` 容器内，`justify-content: flex-end` 靠右

#### Scenario: 跨 tab 位置一致
- **WHEN** 用户在三个 tab 间切换
- **THEN** 分页器始终位于相同的底部靠右位置，大小一致（同一 Pagination 实例，位于 Tabs 之外）

#### Scenario: 列表/卡片切换位置不变
- **WHEN** 用户在同一 tab 内切换列表与卡片视图
- **THEN** 分页器位置与大小保持不变，且**两种视图模式下分页器都可见**（不会出现表格视图下分页器被 Tabs 内部内容顶出视口、卡片视图能看到的差异）

#### Scenario: 表格视图分页器可见性
- **WHEN** 当前视图为表格（pageSize=7）且数据量超过一页
- **THEN** 分页器在视口内可见（依赖嵌套 Tabs 内部高度链补丁约束 Table 不撑高外层）

#### Scenario: 数据不足一页时隐藏
- **WHEN** 当前数据量不超过单页容量
- **THEN** 分页器不显示，但其预留的底部容器不致使框架抖动
