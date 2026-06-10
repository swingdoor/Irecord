## 1. 全局 CSS 清理

- [x] 1.1 删除 `src/renderer/src/styles/index.css` 中的三条 antd Tabs 全局补丁（`.ant-tabs-content-holder`、`.ant-tabs-content`、`.ant-tabs-tabpane`）
- [x] 1.2 编译验证 `npm run build`

## 2. TaskListPage：去分页改滚动

- [x] 2.1 删除 `currentPage` / `pageSize` 状态及相关 `setCurrentPage` 调用
- [x] 2.2 `currentData` 计算逻辑移除分页切片，只保留过滤后全量数组（`filtered` 直接返回，不再 `.slice`）
- [x] 2.3 删除页面底部 `<Pagination>` 渲染及其容器 div
- [x] 2.4 列表内容区 div（`flex:1` 那层）改为 `overflow: auto`（原为 `overflow: hidden`），去掉对 `minHeight:0` 的依赖（保留即可）
- [x] 2.5 三个 tab 的 `children` 传值从 `currentData.paginated` 改为 `currentData`（现在直接是过滤后数组）
- [x] 2.6 编译验证 `npm run build`

## 3. TaskDetailPage：Row/Col → 纯 flex

- [x] 3.1 移除 `Row` / `Col` import（若仅此处使用）
- [x] 3.2 主体区改为：
  ```tsx
  <div style={{ flex: 1, display: 'flex', gap: 16, minHeight: 0, overflow: 'hidden' }}>
    {/* 左侧 58% */}
    <div style={{ flex: '0 0 58%', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
      ...
    </div>
    {/* 右侧 42% */}
    <div style={{ flex: '0 0 calc(42% - 8px)', display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
      ...
    </div>
  </div>
  ```
- [x] 3.3 左侧：`<Card>` 音频播放器保持 `flexShrink: 0`；TranscriptPanel 外层 Card 改为 `flex: 1; minHeight: 0; overflow: hidden`，Card body 同步传 `styles={{ body: { flex:1, minHeight:0, overflow:'hidden', display:'flex', flexDirection:'column' } }}`
- [x] 3.4 右侧：外层容器 `height: 100%` 改为 `flex: 1; minHeight: 0`，确保 AiPanel 父容器高度为确定像素值
- [x] 3.5 编译验证 `npm run build`

## 4. AiPanel：确认 tab 内滚动正常

- [x] 4.1 确认 `renderTab()` 中最外层 div `height: 100%` 在父容器高度确定后能正确生效（步骤 3 完成后可验证）
- [x] 4.2 若仍有 tab 切换跳高，检查 `ai-panel-tabs` scoped CSS 中 `tabpane` 高度约束是否命中正确选择器（antd v6 class 名）
- [x] 4.3 编译验证 `npm run build`

## 5. 验证

- [x] 5.1 `npm run build` 全量通过
- [ ] 5.2 `npm run dev` — 列表页：三个 tab 均可向下滚动，无分页器
- [ ] 5.3 搜索过滤后结果仍可滚动浏览
- [ ] 5.4 窗口缩放：Header + Tab 栏固定，内容区随窗口变化
- [ ] 5.5 TaskDetailPage：左右分栏撑满页面剩余高度，比例正确
- [ ] 5.6 转写内容长时 TranscriptPanel 内部滚动，音频播放器固定
- [ ] 5.7 AiPanel 切换摘要/发言人/纪要/问答/提问，面板高度不跳变，内容可滚动
- [ ] 5.8 AiPanel 提问 tab 的 TextArea 输入正常，回答区可滚动
