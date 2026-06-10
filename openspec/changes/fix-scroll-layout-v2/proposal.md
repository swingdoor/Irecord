## Why

列表页分页器交互繁琐且存在在表格视图下消失的 bug；详情页 AiPanel 切换 tab（摘要/发言人/纪要/问答）时内容高度跳动、无法滚动，根因是 antd Row/Col 高度传递不可靠导致高度链断裂。需要统一解决"内容区固定高度、内部滚动"的布局契约。

## What Changes

- **列表页去分页改滚动**：删除 `TaskListPage` 的 `Pagination` 组件、`currentPage` 状态及分页计算逻辑；列表内容区改为 `flex:1 overflow:auto`，三个 tab 的数据从 `paginated` 切换为全量过滤后数组，支持直接向下滚动浏览所有条目。
- **列表页 Tab 栏布局收紧**：Tab 栏（含搜索框+视图切换）作为 `flexShrink:0` 固定行，内容区在其下方撑满剩余高度。
- **详情页替换 antd Row/Col**：`TaskDetailPage` 主体区用纯 flex div 替换 `<Row>/<Col>`，消除 antd 栅格高度传递不可靠问题，确保左右两侧各自获得确定像素高度。
- **TranscriptPanel 内部滚动**：左侧音频播放器 `flexShrink:0`，TranscriptPanel 区域 `flex:1 overflow:auto` 内部滚动。
- **AiPanel tab 切换不跳高**：右侧 AiPanel 容器高度确定后，`ai-panel-tabs` 的 flex 高度链自然生效，各 tab 内容区 `flex:1 overflow:auto`，切换不再引起高度变化。
- **去除全局 antd Tabs 补丁**：删除 `index.css` 中 `.ant-tabs-tabpane { height:100% }` 全局覆盖，改为在各使用方局部控制，避免误伤其他 Tabs 组件。

## Capabilities

### New Capabilities

- `list-scroll-layout`：列表页布局契约——Header 固定、Tab 栏固定、内容区 flex:1 overflow:auto 向下滚动、无分页器。
- `detail-page-flex-layout`：详情页布局契约——纯 flex 实现左右固定比例分栏，各区域高度确定、内部按需滚动，窗口调整大小后比例不变。

### Modified Capabilities

（无——现有 `app-shell-layout` 契约不变，本 change 在其基础上向下延伸。）

## Impact

- **页面**：`src/renderer/src/pages/TaskListPage.tsx`（删分页，改数据传递，调整内容区样式）、`src/renderer/src/pages/TaskDetailPage.tsx`（Row/Col → flex div）。
- **全局样式**：`src/renderer/src/styles/index.css`（删除 `.ant-tabs-tabpane` 全局补丁）。
- **组件**：`src/renderer/src/components/AiPanel.tsx`（确认/修正父容器高度确定后 tab 内滚动）；`TaskTable` / `RealtimeRecordingTable` / `KnowledgeTable` 不再接收分页后的数据切片，接收全量过滤数组（props 无需改，仅调用方传值变化）。
- **依赖**：无新增。纯布局/样式调整。
- **不影响**：业务逻辑、IPC、转写流水线、搜索过滤逻辑（仅移除分页切片）。
