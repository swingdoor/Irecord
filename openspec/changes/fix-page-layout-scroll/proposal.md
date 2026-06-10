## Why

应用所有页面都存在「整页可滚动、鼠标滚轮导致页面上下晃动」的问题。根因有两层：

1. **高度链断裂**：`index.css` 中 `html` / `body` / `#root` 都未设置 `height: 100%`，React 应用挂载点 `#root` 高度由内容撑开，没有视口约束。

2. **`100vh` 叠加拖拽栏溢出**：`App.tsx` 顶部有一个 30px 的窗口拖拽栏（`WebkitAppRegion: 'drag'`），它与各页面是兄弟节点。各页面根容器却用 `height: 100vh` / `minHeight: 100vh`——`100vh` 是相对**视口**而非父容器，于是「30px 拖拽栏 + 100vh 页面」总高超出视口 30px，必然产生约 30px 的滚动晃动。

这个问题影响所有 5 个页面（TaskListPage / TaskDetailPage / RealtimeRecordingDetailPage / RecordingPage / KnowledgeDetailPage）。此前在 `unify-recording-transcription` 中尝试用「内容区 overflow:auto」局部缓解，反而把分页器结构搞乱，且没解决根因——分页器「看起来位置错乱」实际是溢出把它推到视口外、需滚动才可见所致，并非分页器代码本身的问题。

本 change 从根上建立完整高度链，让页面框架精确填满「视口 − 拖拽栏」，框架本身永不滚动，仅内部指定区域（转写面板、AI 面板、编辑器、列表内容）按需滚动。

## What Changes

- **全局 CSS 建立高度链**：`index.css` 给 `html` / `body` / `#root` 设 `height: 100%` + `overflow: hidden`，从挂载点起就有确定的视口高度约束。
- **App.tsx 改为 flex 布局分配高度**：把拖拽栏 + 页面包进一个 `height: 100%` 的 flex column 容器；拖拽栏 `flexShrink: 0`，页面区 `flex: 1` + `minHeight: 0`，使页面精确获得「视口 − 30px」的高度，不再溢出。
- **各页面根容器 `100vh` → `100%`**：5 个页面根容器从 `height: 100vh` / `minHeight: 100vh` 改为 `height: 100%`（继承父级确定高度），并确保 `overflow: hidden`，框架不滚动。
- **内部滚动区域明确化**：
  - TaskDetailPage：TranscriptPanel / AiPanel 区域内部滚动（现有结构已支持，仅修高度根）。
  - KnowledgeDetailPage：TipTapEditor 区域内部滚动（现有结构已支持，仅修高度根）。
  - RealtimeRecordingDetailPage：内容区（音频 + 状态卡片）若超高则该区域内部滚动。
  - RecordingPage：内容居中，框架不滚动（内容通常不超高）。
  - TaskListPage：Tabs 内容区（列表/卡片）通过分页控制在一屏内，不滚动；分页器固定底部靠右。
- **分页器位置统一确认**：TaskListPage 单一 `Pagination` 位于 Tabs 之外、底部 `flexShrink: 0` 容器内，`justify-content: flex-end` 靠右；三个 tab 共用同一分页器，列表/卡片切换时位置与大小不变（修复高度链后自然稳定，无需改分页器代码）。

## Capabilities

### New Capabilities
- `app-shell-layout`: 应用外壳布局契约——从 `html/body/#root` 到拖拽栏与页面的完整高度链；页面框架精确填满「视口 − 拖拽栏」且不滚动；滚动仅发生在页面内部指定区域；列表页分页器固定底部靠右、跨 tab 与视图模式位置一致。

## Impact

- **全局样式**：`src/renderer/src/styles/index.css` 增加 `html, body, #root { height: 100%; overflow: hidden; }`。
- **应用外壳**：`src/renderer/src/App.tsx` 拖拽栏 + 页面包入 flex column 容器，页面区 `flex: 1` + `minHeight: 0`。
- **页面**：`TaskListPage.tsx` / `TaskDetailPage.tsx` / `RealtimeRecordingDetailPage.tsx` / `RecordingPage.tsx` / `KnowledgeDetailPage.tsx` 根容器 `100vh`/`minHeight:100vh` → `height:100%`，确保 `overflow: hidden`。
- **依赖**：无新增。纯 CSS/布局调整。
- **不影响**：业务逻辑、数据流、IPC、转写流水线、分页/搜索的数据计算逻辑（仅修复其容器高度与可见性）。
- **风险**：低。改动集中在容器高度与 overflow，无逻辑变更；每页改完目测验证滚动与分页器位置即可。
