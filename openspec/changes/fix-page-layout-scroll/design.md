## Context

应用所有页面都能整页滚动，鼠标滚轮导致约 30px 的上下晃动。此前在 `unify-recording-transcription` 中多次尝试用「内容区 `overflow: auto` + 固定头尾」局部修补，不仅没根治，还把 TaskListPage 分页器的 JSX 结构改乱（出现重复块、残留 `search` 引用导致运行时崩溃）。

根因诊断（DOM 高度链）：

```
当前（断裂的高度链 + 100vh 叠加溢出）
─────────────────────────────────────────────
<html>                    height 未设 → auto
  <body>                  height 未设 → auto
    <div #root>           height 未设 → auto（被内容撑开）
      <ConfigProvider><AntApp>   无高度/无 flex
        ┌─ 拖拽栏 height:30 ──────────┐  ← 兄弟节点 A
        └─────────────────────────────┘
        ┌─ 页面 height:100vh ─────────┐  ← 兄弟节点 B
        │   100vh = 相对【视口】       │     相对视口，不减拖拽栏
        │   而非「视口 − 30px」        │
        └─────────────────────────────┘
   总高 = 30px + 100vh = 视口 + 30px → 溢出 30px → 滚动晃动
```

```
目标（完整高度链 + flex 分配）
─────────────────────────────────────────────
html  { height:100%; overflow:hidden }
 body { height:100%; overflow:hidden }
  #root { height:100%; overflow:hidden }
    AntApp 包一层 flex column, height:100%
      ┌─ 拖拽栏 flexShrink:0 (30px) ─┐
      └──────────────────────────────┘
      ┌─ 页面 flex:1, minHeight:0 ───┐  ← 自动 = 视口 − 30px
      │   页面根 height:100% (继承)   │
      │   overflow:hidden            │
      │   ┌─ 内部区域 flex:1 ───────┐│  ← 仅此处按需滚动
      │   │  overflow:auto          ││
      │   └──────────────────────────┘│
      └──────────────────────────────┘
   总高精确 = 视口，无溢出，框架不滚动
```

**关键约束（来自用户决策）**：
1. 全部 5 个页面一起修（根因相同，分开修留坑）。
2. 页面框架不滚动；滚动只发生在内部指定区域。
3. 分页器三个 tab 都在底部靠右，大小位置一致；列表/卡片切换后位置也一致。

## Goals / Non-Goals

**Goals:**
- 建立 `html → body → #root → AntApp → 页面` 的完整高度链。
- 拖拽栏与页面用 flex 正确分配，页面精确得到「视口 − 拖拽栏」高度。
- 5 个页面框架均不滚动；内部需要的区域（转写/AI/编辑器）按需滚动。
- 分页器位置稳定统一，无需改分页器逻辑（修高度链即自然归位）。

**Non-Goals:**
- 不改任何业务逻辑、数据流、IPC、分页/搜索的数据计算。
- 不重构 TaskListPage 已经提升到父组件的 search/viewMode/分页 状态（那部分逻辑正确，只是容器高度有问题）。
- 不处理 Ant Design API 弃用警告（`Space.direction`、`Tabs.TabPane`、`Modal.destroyOnClose` 等）——另行处理。
- 不引入 CSS 框架或新依赖。

## Decisions

### 1. 在 `#root` 及祖先建立高度链，而非给每个页面写死 100vh

**决策**：`index.css` 设 `html, body, #root { height: 100%; overflow: hidden; }`。页面根容器改用 `height: 100%` 继承。

**理由**：`100vh` 永远相对视口，无法感知上方 30px 拖拽栏，是溢出的直接原因。`height: 100%` 依赖父级确定高度，一旦高度链完整，每层都能精确继承，拖拽栏占位由 flex 自动扣除。

**备选**：页面根用 `height: calc(100vh - 30px)` → 否决：把魔法数字 30 散布到 5 个页面，拖拽栏高度一旦变化要改多处；flex `flex:1` 自动适配更稳。

### 2. App.tsx 用 flex column 承载拖拽栏 + 页面

**决策**：`AntApp` 内层包一个 `display:flex; flexDirection:column; height:100%` 容器；拖拽栏 `flexShrink:0`；页面挂载区 `flex:1; minHeight:0; overflow:hidden`。

**理由**：拖拽栏定高、页面吃剩余空间，是 flex 的标准用法。`minHeight:0` 是关键——flex 子项默认 `min-height:auto` 会被内容撑大导致溢出，置 0 才允许其收缩到容器内、把溢出交给内部滚动区。

**实现要点**：
```
<div style={{ height:'100%', display:'flex', flexDirection:'column' }}>
  <div style={{ height:30, flexShrink:0, WebkitAppRegion:'drag' }} />
  <div style={{ flex:1, minHeight:0, overflow:'hidden' }}>
    {当前页面}
  </div>
</div>
```

### 3. 内部滚动区域逐页明确

**决策**：框架不滚动，滚动下沉到内容区。各页内部滚动点：

| 页面 | 框架 | 内部滚动区 |
|------|------|-----------|
| TaskListPage | 不滚动 | 列表/卡片由分页限制在一屏，不滚动；分页器固定底部 |
| TaskDetailPage | 不滚动 | 左侧 TranscriptPanel、右侧 AiPanel 各自 `overflow:auto`（现有） |
| KnowledgeDetailPage | 不滚动 | TipTapEditor 区域内部滚动（现有） |
| RealtimeRecordingDetailPage | 不滚动 | 内容区（音频+状态卡片）若超高则该区 `overflow:auto` |
| RecordingPage | 不滚动 | 内容居中，通常不超高；超高时内容区 `overflow:auto` |

**理由**：TaskDetail/KnowledgeDetail 已是「头部固定 + 内部 flex:1 overflow:hidden 区」结构，只需把根 `100vh→100%`，内部滚动天然生效。其余页面同理下沉。

### 4. 分页器不改逻辑，仅靠高度链修复归位

**决策**：保留 TaskListPage 现有分页器结构——单一 `Pagination`，位于 Tabs **之外**的底部 `flexShrink:0` 容器，`display:flex; justifyContent:flex-end`。不动其代码。

**理由**：分页器「看起来坏了」是溢出把它推出视口、需滚动才可见所致，并非代码问题。它在 Tabs 外、父级固定，本就跨三个 tab 共用、与 viewMode 无关。高度链修复后，底部容器稳定在「视口 − 拖拽栏」的底边，分页器自然固定右下，列表/卡片切换位置不变。

## Risks / Trade-offs

### [风险] 某内部区域漏设 overflow 导致该区撑破框架
**场景**：页面根 `overflow:hidden` 后，若内部某区未设滚动且内容超高，会被裁剪不可见（而非滚动）。
**缓解**：逐页确认内部「长内容区」都有 `flex:1; minHeight:0; overflow:auto`。详情页已具备；录音/录音详情内容短，超高风险低，仍补 `overflow:auto` 兜底。

### [风险] flex 子项未设 minHeight:0 仍溢出
**场景**：flex 默认 `min-height:auto`，长内容会把子项顶大、穿透 `overflow:hidden`。
**缓解**：App.tsx 页面区与各页内部滚动区均显式 `minHeight:0`。

### [权衡] 全局 `overflow:hidden` 禁止一切整页滚动
**场景**：未来若有页面确实需要整页滚动，会被全局规则挡住。
**缓解**：当前 5 页都是「框架固定 + 内部滚动」模型，符合桌面应用心智；未来如需整页滚动的页面，可在该页内部自建滚动容器，不依赖整页滚动。

## Migration Plan

1. **改全局 CSS**：`index.css` 加 `html, body, #root { height:100%; overflow:hidden; }`。
2. **改 App.tsx**：拖拽栏 + 页面包入 flex column 容器，页面区 `flex:1; minHeight:0; overflow:hidden`。
3. **逐页改根容器**：5 个页面 `100vh`/`minHeight:100vh` → `height:100%`，确认 `overflow:hidden` 与内部滚动区 `minHeight:0; overflow:auto`。
4. **每步 `npm run build`**；最后 `npm run dev` 逐页目测：
   - 滚轮无晃动、框架不动；
   - 详情页内部长内容可滚；
   - TaskListPage 分页器固定右下，切 tab、切列表/卡片位置一致。

## Open Questions

1. **RecordingPage 内容垂直居中 vs 顶部对齐？** 当前居中。框架不滚动后，若内容偶尔超高需滚动，居中布局体验略差。建议：内容区 `overflow:auto` 兜底，保持居中。
2. **拖拽栏 30px 是否抽成常量？** 目前散在 App.tsx 一处，flex 方案下其余页面不再依赖该数值，无需抽常量；保持现状即可。
