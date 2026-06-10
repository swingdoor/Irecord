## Context

`fix-page-layout-scroll` 已经修好了页面级高度链：`html → body → #root → AntApp → 页面` 全部 `height:100%`，页面框架不滚动。但用户实测发现：

1. **表格视图下分页器看不见，卡片视图能看见**——这是 antd v6 `<Tabs>` 内部还有两层默认 `height:auto` 的容器（`.ant-tabs-content-holder`、`.ant-tabs-content`），让 TabPane 上设置的 `height:100%` 无效。Table 没有内部滚动，自然撑高 → 把分页器挤出视口；卡片 6 条总高较低，正好装下。

2. **工具栏占两行**——「搜索 + 列表/卡片切换」是一行，「Tab 标签栏」又是一行，纵向浪费、视觉割裂。antd Tabs 提供 `tabBarExtraContent` 专门解决这种「Tab 栏 + 右侧附加控件」的场景。

3. **知识整理列表的入口冗余**——KnowledgeTable 工具栏既有「新建文档」（与 FeatureCards 知识整理卡片重复），又有「管理模板」（应该和"卡片操作类入口"一起放在 FeatureCards 里）。

`Tabs.TabPane` 在 antd v6 已弃用（console 持续报警告），改用 `items` prop 是顺手收尾的事——和工具栏重组天然一起做。

## Goals / Non-Goals

**Goals:**
- 修复 antd Tabs 内部高度链断裂导致的分页器消失 bug。
- TaskListPage 工具栏：搜索 + 列表/卡片切换 + Tab 标签栏并列同一行。
- KnowledgeTable 列表工具栏移除「新建文档」「管理模板」，按钮职责重新归位到 FeatureCards。
- FeatureCards 知识整理卡片右上角放「管理模板」按钮（无边框），与卡片本身的"新建文档"按钮职责区分清晰。
- 顺带把 `Tabs.TabPane` 改为 `items` 写法，消除 antd v6 弃用警告。

**Non-Goals:**
- 不改 viewMode/searchTerm/currentPage 的状态提升与数据流（`fix-page-layout-scroll` 已确立，正确）。
- 不改 TaskTable / RealtimeRecordingTable 内部渲染（它们的容器约束已正确，bug 在 antd Tabs 这一层）。
- 不动其他 Ant Design API 弃用警告（`Space.direction`、`Modal.destroyOnClose` 等）——和本变更主线无关。
- 不引入新依赖、不改业务逻辑或数据模型。

## Decisions

### 1. 用全局 CSS 补丁修 antd Tabs 高度链，而非给 Tabs 加自定义类名

**决策**：在 `index.css` 直接用 antd 标准类选择器：

```css
.ant-tabs-content-holder { height: 100%; overflow: hidden; }
.ant-tabs-content { height: 100%; }
.ant-tabs-tabpane { height: 100%; overflow: hidden; }
```

**理由**：
- 项目内只有 2 处 `<Tabs>`：TaskListPage（需要这套约束）、AiPanel（已有 `ai-panel-tabs` 自定义类 + 自己的样式控制，且其内容本就需要内部滚动 `overflow:auto`）。
- 全局补丁让 TaskListPage 的高度链完整生效，而 AiPanel 的更具体类选择器（CSS 特异性更高）会覆盖兜底。
- 替代方案：给 TaskListPage 的 Tabs 加自定义 className → 否决：等价的局部覆盖代码量更多，且每个新加 Tabs 的页面都要重复这套样式。

**风险**：一旦未来引入新的 `<Tabs>` 不希望全部撑满高度的场景，需要单独覆盖。可接受——这是 antd v6 的标准布局假设之一。

### 2. 用 antd Tabs 的 `items` + `tabBarExtraContent` 一次性重组工具栏

**决策**：TaskListPage 把 Tabs 改写为 `items` 数组，搜索框 + 视图切换塞到 `tabBarExtraContent`（默认靠右）：

```typescript
<Tabs
  activeKey={activeTab}
  onChange={handleTabChange}
  items={[
    { key: 'realtime',  label: '实时录音', children: <RealtimeRecordingTable .../> },
    { key: 'upload',    label: '文件上传', children: <TaskTable .../> },
    { key: 'knowledge', label: '知识整理', children: <KnowledgeTable .../> },
  ]}
  tabBarExtraContent={
    <Space>
      <Input prefix={<SearchOutlined/>} value={searchTerm} ... style={{ width: 240 }} />
      <Segmented value={viewMode} options={[...]} ... />
    </Space>
  }
  style={{ flex:1, display:'flex', flexDirection:'column', minHeight:0, overflow:'hidden' }}
/>
```

**理由**：
- 一次性解决「同行布局」+「`Tabs.TabPane` 弃用警告」+「Tab 切换的样式控制」三件事。
- `tabBarExtraContent` 是 antd 设计的规范用法，无需额外的 flex 布局技巧。
- 替代方案：保留 `TabPane`，用 flex 布局把搜索栏塞到 Tab 栏右边 → 否决：CSS 复杂、跨 antd 版本可能有兼容问题、还得另解决弃用警告。

### 3. 搜索/视图切换全局共享，不分 tab

**决策**：搜索词与视图模式（列表/卡片）跨三个 tab 共用同一份状态（与 `fix-page-layout-scroll` 现状一致）。切换 tab 时清空搜索、重置页码。

**理由**：
- 视觉上 `tabBarExtraContent` 在 Tab 栏右侧，并不强烈暗示"分 tab 独立"，且全局共享心智更简单（用户不必为每个 tab 单独记搜索关键词）。
- 当前实现已是全局，不打破。
- 输入框宽度从 `300px` 缩到 `240px`（放到 Tab 栏右侧空间有限）。

### 4. 模板管理按钮放在 FeatureCards 知识整理卡片**右上角**，无边框

**决策**：FeatureCards 增加 `onManageTemplates` prop；知识整理 `<Card>` 加 `extra={<Button type="text" icon={<SettingOutlined/>} onClick={onManageTemplates}>管理模板</Button>}`。

```
┌─────────────────────────────┐
│ 📄 知识整理      [⚙ 管理模板]│ ← extra 槽位，type="text" 无边框
│                             │
│ 基于识别结果，AI 生成结构...   │
│ [📄 新建文档]               │
└─────────────────────────────┘
```

**理由**：
- antd `<Card>` 的 `extra` prop 专门用于卡片标题右侧的辅助操作，这正是 antd 官方推荐位置。
- `type="text"` 让按钮本身无边框，符合"次要操作"的视觉权重。
- 和卡片主操作（"新建文档"按钮）形成主次分明的层级。

### 5. TemplateManagerModal 提升到 TaskListPage

**决策**：把 `templateModalOpen` 状态与 `<TemplateManagerModal>` 渲染从 KnowledgeTable 提升到 TaskListPage（与 `<SettingsModal>`、`<CreateDocModal>` 同级）。

**理由**：
- 触发点从 KnowledgeTable 内移到 FeatureCards（卡片层级），KnowledgeTable 不再持有 modal。
- TaskListPage 顶层集中管理所有 modal，与现有模式一致。
- 替代方案：把 modal 状态挂在 FeatureCards 内 → 否决：FeatureCards 是纯展示组件（无状态），违反单一职责。

## Risks / Trade-offs

### [风险] 全局 CSS 补丁影响 AiPanel 的 Tabs
**场景**：`.ant-tabs-tabpane { height:100%; overflow:hidden }` 全局生效后，AiPanel 内 Tabs 的内容也会被这套约束影响。
**缓解**：AiPanel 已有 `ai-panel-tabs` 自定义类 + 内部 `overflow:auto`，CSS 特异性更高，`overflow` 属性会被覆盖。验证时手测 AiPanel 内容滚动正常即可。若发现问题，可将补丁加更具体的限定（如限定父级 className）。

### [风险] tabBarExtraContent 在小窗口下空间不足
**场景**：窗口宽度极小时，Tab 标签 + 搜索 + Segmented 横向挤压。
**缓解**：搜索框 width 缩到 240px；Segmented 是图标+短文本，本身紧凑。当前应用最小窗口宽度有 minWidth 限制（≥1000），实际可用横向空间充足。

### [风险] CSS 补丁可能在 antd 升级时失效
**场景**：antd 某版本改变内部类名结构。
**缓解**：使用的都是 antd v6 标准公开类名（文档明确）；升级时若失效会立即反映为 TaskListPage 表格视图分页器不可见，回归测试可立刻发现。

## Migration Plan

1. **CSS 补丁**：`index.css` 增加 Tabs 内部高度链补丁。
2. **TaskListPage 重构 Tabs**：`Tabs.TabPane` → `items` 数组；搜索 + Segmented 移入 `tabBarExtraContent`；删除原独立搜索栏 div。
3. **TaskListPage 提升 modal**：增加 `templateModalOpen` 状态、渲染 `<TemplateManagerModal>`、传 `onManageTemplates` 给 FeatureCards。
4. **FeatureCards 改造**：知识整理 `<Card>` 加 `extra` 槽位「管理模板」按钮；接收 `onManageTemplates` prop。
5. **KnowledgeTable 简化**：删除「新建文档」「管理模板」按钮、`onCreateNew` prop、TemplateManagerModal 渲染与 `templateModalOpen` 状态；保留批量操作。
6. **每步 `npm run build`**；最后 `npm run dev` 目测：
   - 表格视图分页器可见、卡片视图分页器可见，三个 tab 一致；
   - Tab 栏右侧 = 搜索 + 列表/卡片切换；
   - FeatureCards 知识整理卡片右上「管理模板」按钮可触发 modal；
   - 控制台无 `Tabs.TabPane` 弃用警告；AiPanel 内容滚动正常。

## Open Questions

1. **搜索框宽度** 当前定 240px，若 Tab 栏右侧空间富余可再放宽到 280px。视觉调试时确认即可。
2. **管理模板按钮文案** 「管理模板」vs 「模板」？保持「管理模板」更明确，与 `TemplateManagerModal` 弹窗职责对得上。
