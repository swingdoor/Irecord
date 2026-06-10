## Context

应用基于 Electron + React + antd v6，高度链已在 `fix-page-layout-scroll` 中建立：`html/body/#root height:100%`，App.tsx flex column，拖拽栏 30px + 页面区 flex:1。

当前问题：
1. `TaskListPage` 使用 antd `<Pagination>` 限制每页 9 条，分页器在表格视图下偶发消失，且翻页交互繁琐。
2. `TaskDetailPage` 主体区使用 antd `<Row gutter={16} align="stretch">/<Col>`——antd 栅格是基于 float/flex 但不强制传递确定像素高度，导致 AiPanel 父容器 `height: 100%` 退化为 `height: auto`，各 tab 内容高度不同时切换产生跳动。
3. `index.css` 中有全局 `.ant-tabs-tabpane { height: 100%; overflow: hidden }` 补丁，可能对其他使用 Tabs 的地方产生副作用。

## Goals / Non-Goals

**Goals:**
- 列表页内容区滚动化，彻底去除分页逻辑
- 详情页 TranscriptPanel / AiPanel 高度固定（随窗口等比），内部各自滚动
- AiPanel tab 切换不再跳高
- 窗口缩放后各区域比例保持稳定

**Non-Goals:**
- 不修改 KnowledgeDetailPage / RealtimeRecordingDetailPage（布局结构不同，不在本次范围）
- 不改变业务逻辑、IPC、搜索过滤
- 不引入新的第三方依赖

## Decisions

### 决策 1：列表内容区直接 overflow:auto，不用虚拟列表

**选择**：移除分页，内容区 `flex:1; overflow:auto`，数据全量传入 Table 组件。

**备选**：引入 `react-window` 虚拟滚动。

**理由**：当前数据量（录音/文件/文档）在数百条量级，antd Table 原生渲染无性能压力。虚拟列表引入额外依赖和复杂度，不必要。

---

### 决策 2：用纯 flex div 替换 antd Row/Col

**选择**：`TaskDetailPage` 主体区改为：
```
<div style={{ flex:1, display:'flex', gap:16, minHeight:0, overflow:'hidden' }}>
  <div style={{ flex:'0 0 58%', display:'flex', flexDirection:'column', minWidth:0 }}>  {/* 左 */}
  <div style={{ flex:'0 0 calc(42% - 8px)', display:'flex', flexDirection:'column', minWidth:0 }}>  {/* 右 */}
```

**备选**：保留 Row/Col，强制加 `style={{ height:'100%' }}` 到 Col。

**理由**：antd Col 的 `height:100%` 在 `align="stretch"` Row 下虽然通常有效，但依赖内部 CSS 实现细节，不同版本行为不一致。纯 flex div 行为完全确定，无依赖风险。比例用 `flex: 0 0 58%` 固定，窗口缩放时自动跟随父容器。

---

### 决策 3：去除全局 .ant-tabs-tabpane 补丁

**选择**：删除 `index.css` 中三条全局 antd Tabs 补丁（`content-holder`/`content`/`tabpane`），AiPanel 已有 `ai-panel-tabs` scoped 样式自行控制。

**备选**：保留全局补丁。

**理由**：全局补丁会让所有使用 antd Tabs 的地方 `overflow:hidden`，若某处 Tabs 内容本身需要自然撑高（如 Modal 内的 Tabs），会静默裁剪内容。AiPanel 的 scoped 样式已覆盖所需行为，`TaskListPage` 内容区改为外层容器控制滚动后不再依赖此补丁。

## Risks / Trade-offs

- **antd Table 在大数据量下性能** → 目前用户数据量小，可接受；未来数据量大时可补充虚拟滚动。
- **删全局 Tabs 补丁后其他页面** → 搜索全库仅 TaskListPage 和 AiPanel 使用 Tabs，AiPanel 有 scoped 覆盖，TaskListPage 改外层控制后不依赖补丁，风险低。
- **比例固定 58/42 不可拖拽调整** → 满足当前需求；未来若需可拖拽分栏可引入 resizable panel 库。
