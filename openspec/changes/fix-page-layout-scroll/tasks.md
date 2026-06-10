## 1. 全局高度链

- [x] 1.1 `src/renderer/src/styles/index.css` 增加 `html, body, #root { height: 100%; overflow: hidden; }`
- [x] 1.2 确认 `* { box-sizing: border-box }` 已存在（避免 padding 撑高），无则补
- [x] 1.3 编译验证 `npm run build`

## 2. 应用外壳 flex 布局

- [x] 2.1 `App.tsx` 在 `AntApp` 内层包一个 `display:flex; flexDirection:column; height:100%` 容器
- [x] 2.2 拖拽栏 `div` 保持 `height:30; flexShrink:0; WebkitAppRegion:'drag'`
- [x] 2.3 页面挂载区包一层 `flex:1; minHeight:0; overflow:hidden` 容器，内部渲染各 page 分支
- [x] 2.4 编译验证 `npm run build`

## 3. TaskListPage 根容器与分页器

- [x] 3.1 根容器 `height:100vh` → `height:100%`，保留 `display:flex; flexDirection:column; overflow:hidden`
- [x] 3.2 确认 Header 区 `flexShrink:0`、Tabs+内容区 `flex:1; minHeight:0; overflow:hidden`、分页器区 `flexShrink:0`
- [x] 3.3 确认分页器位于 Tabs 之外、`display:flex; justifyContent:flex-end`，不改其逻辑
- [x] 3.4 确认 Tabs 内容区不滚动（分页已限制在一屏）
- [x] 3.5 编译验证 `npm run build`

## 4. TaskDetailPage

- [x] 4.1 根容器 `height:100vh` → `height:100%`，保留 `overflow:hidden`
- [x] 4.2 确认 Body 的 Row `flex:1; overflow:hidden`、左右 Col `height:100%`，TranscriptPanel/AiPanel 内部 `overflow:auto`（现有结构）
- [x] 4.3 编译验证 `npm run build`

## 5. KnowledgeDetailPage

- [x] 5.1 根容器 `height:100vh` → `height:100%`，保留 `overflow:hidden`
- [x] 5.2 确认编辑器区 `flex:1; minHeight:0; overflow:hidden`，TipTapEditor 内部滚动
- [x] 5.3 编译验证 `npm run build`

## 6. RealtimeRecordingDetailPage

- [x] 6.1 根容器 `minHeight:100vh` → `height:100%`，增加 `overflow:hidden`，`display:flex; flexDirection:column`
- [x] 6.2 头部操作栏 `flexShrink:0`；内容区（音频+状态卡片）包入 `flex:1; minHeight:0; overflow:auto` 容器兜底
- [x] 6.3 编译验证 `npm run build`

## 7. RecordingPage

- [x] 7.1 根容器 `minHeight:100vh` → `height:100%`，增加 `overflow:hidden`
- [x] 7.2 内容居中区包入 `flex:1; minHeight:0; overflow:auto` 容器兜底（防偶发超高）
- [x] 7.3 编译验证 `npm run build`

## 8. 验证

- [x] 8.1 `npm run build` 全量通过
- [ ] 8.2 `npm run dev` 逐页目测：滚轮无晃动、框架不动
- [ ] 8.3 TaskDetailPage / KnowledgeDetailPage 内部长内容可正常滚动
- [ ] 8.4 TaskListPage：分页器固定右下；切换三个 tab 位置一致；列表/卡片切换位置一致
- [ ] 8.5 RecordingPage / RealtimeRecordingDetailPage：框架不滚动，内容正常显示
- [x] 8.6 确认无内容被 `overflow:hidden` 意外裁剪（内部滚动区都设了 `overflow:auto` + `minHeight:0`）
