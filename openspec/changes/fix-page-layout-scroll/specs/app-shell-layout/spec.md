## ADDED Requirements

### Requirement: 完整视口高度链
系统 SHALL 从挂载点祖先建立完整高度链，使页面框架精确填满「视口 − 拖拽栏」高度，整页框架不可滚动。

#### Scenario: 全局高度约束
- **WHEN** 应用加载
- **THEN** `html`、`body`、`#root` 均为 `height: 100%` 且 `overflow: hidden`，挂载点具备确定的视口高度约束

#### Scenario: 拖拽栏与页面 flex 分配
- **WHEN** 渲染应用外壳
- **THEN** 30px 窗口拖拽栏 `flexShrink: 0`、页面挂载区 `flex: 1` 且 `minHeight: 0`，页面精确获得「视口 − 30px」高度，无溢出

#### Scenario: 页面根容器继承高度
- **WHEN** 任一页面渲染
- **THEN** 其根容器使用 `height: 100%`（继承父级确定高度）而非 `100vh`，并 `overflow: hidden`

#### Scenario: 滚轮不晃动
- **WHEN** 用户在任一页面滚动鼠标滚轮
- **THEN** 页面框架（标题、操作区、底部分页器等固定元素）不发生上下位移

### Requirement: 滚动下沉至内部区域
系统 SHALL 将滚动限制在页面内部指定的内容区域，框架其余部分保持固定。

#### Scenario: 转写详情内部滚动
- **WHEN** TaskDetailPage 的转写文本或 AI 面板内容超过可视高度
- **THEN** 仅对应面板区域内部滚动，页面头部与左右布局框架固定

#### Scenario: 知识文档编辑器内部滚动
- **WHEN** KnowledgeDetailPage 的文档内容超过可视高度
- **THEN** 仅编辑器区域内部滚动，标题栏固定

#### Scenario: 录音详情内容区滚动
- **WHEN** RealtimeRecordingDetailPage 内容超过可视高度
- **THEN** 仅内容区内部滚动，头部操作栏固定

#### Scenario: 列表页内容由分页约束
- **WHEN** TaskListPage 展示列表或卡片
- **THEN** 数据由分页限制在一屏内，内容区不滚动；头部、搜索栏、分页器均固定

### Requirement: 列表页分页器位置统一
系统 SHALL 使 TaskListPage 的分页器固定于页面底部靠右，跨三个 tab 与列表/卡片视图位置、大小一致。

#### Scenario: 分页器固定底部靠右
- **WHEN** 任一 tab（实时录音/文件上传/知识整理）的数据超过一页
- **THEN** 分页器显示在页面底部 `flexShrink: 0` 容器内，`justify-content: flex-end` 靠右

#### Scenario: 跨 tab 位置一致
- **WHEN** 用户在三个 tab 间切换
- **THEN** 分页器始终位于相同的底部靠右位置，大小一致（同一 Pagination 实例，位于 Tabs 之外）

#### Scenario: 列表/卡片切换位置不变
- **WHEN** 用户在同一 tab 内切换列表与卡片视图
- **THEN** 分页器位置与大小保持不变

#### Scenario: 数据不足一页时隐藏
- **WHEN** 当前数据量不超过单页容量
- **THEN** 分页器不显示，但其预留的底部容器不致使框架抖动
