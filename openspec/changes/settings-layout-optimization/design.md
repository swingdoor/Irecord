## Context

设置页面使用 Ant Design 的 Form 组件，采用 horizontal 布局模式。当前实现中：
- 标签列使用 `labelCol={{ span: 6 }}`，占据 25% 宽度
- 输入列使用不一致的 `wrapperCol`（14 或 18），导致输入框长度不统一
- Tooltip 图标通过 flex 布局嵌入在输入框内部，导致有 tooltip 的输入框被压缩

这种实现导致视觉不平衡和对齐问题，需要统一布局规范。

## Goals / Non-Goals

**Goals:**
- 减少左侧标签列留白，提升空间利用率
- 统一所有输入框/下拉框的视觉宽度
- 将 tooltip 图标移到输入框右侧独立位置
- 保持现有功能和交互不变

**Non-Goals:**
- 不改变表单验证逻辑
- 不修改表单数据结构
- 不调整 Modal 宽度或其他容器尺寸
- 不改变 tooltip 的内容或交互行为

## Decisions

### Decision 1: 使用 Ant Design Grid 系统调整列宽

**选择：** `labelCol: 5, wrapperCol: 17`

**理由：**
- labelCol: 5 (20.8%) 相比当前的 6 (25%) 减少留白，但仍保持标签可读性
- wrapperCol: 17 (70.8%) 为输入框提供充足空间
- 剩余 2/24 (8.3%) 用于 tooltip 图标和右侧留白

**备选方案：**
- labelCol: 4, wrapperCol: 18 - 标签列过窄，中文标签可能换行
- 使用固定像素宽度 - 不适配不同屏幕尺寸

### Decision 2: Tooltip 图标使用绝对定位

**选择：** 在 Form.Item 内部添加绝对定位的 tooltip 图标

**实现方式：**
```tsx
<Form.Item 
  label="VAD 阈值" 
  name="qwen3VadThreshold"
  className="form-item-with-tooltip"
>
  <InputNumber min={0.1} max={0.9} step={0.05} />
  <Tooltip title="...">
    <QuestionCircleOutlined className="tooltip-icon" />
  </Tooltip>
</Form.Item>

// CSS
.form-item-with-tooltip {
  position: relative;
}
.form-item-with-tooltip .tooltip-icon {
  position: absolute;
  right: -32px;
  top: 50%;
  transform: translateY(-50%);
  color: #999;
  cursor: help;
}
```

**理由：**
- 输入框不受 tooltip 影响，宽度保持一致
- tooltip 图标位置固定，视觉对齐
- 不破坏 Form.Item 的验证和状态管理

**备选方案：**
- 使用 Row/Col 包装 - 破坏 Form 的对齐机制
- 使用 Form.Item 的 tooltip 属性 - 图标在左侧 label 旁边，不符合需求
- 使用 flex 布局 - 导致输入框宽度不一致

### Decision 3: 统一所有标签页的布局配置

**选择：** 所有标签页使用相同的 `labelCol: 5, wrapperCol: 17`

**理由：**
- 保持视觉一致性
- 简化维护
- 用户在不同标签页切换时体验统一

### Decision 4: 使用 Flex 布局统一输入框长度（最终方案）

**问题演变：**
1. 最初使用 `addonAfter` 导致带单位和不带单位的输入框长度不一致
2. 尝试用绝对定位的单位标签，但导致默认值不显示、增减按钮重叠等问题
3. 尝试用 CSS hack（`calc(100% - 40px)`）统一长度，但代码复杂且难以维护

**最终选择：** 在 Form.Item 内部使用 flex 布局容器，统一管理输入框、单位、tooltip

**实现方式：**
```tsx
<Form.Item label="音频增益" name="qwen3AudioGain">
  <div className="input-wrapper">
    <InputNumber min={1.0} max={10.0} step={0.5} />
    <span className="unit-text">倍</span>
    <span style={{ width: 24 }}></span> {/* tooltip 占位 */}
  </div>
</Form.Item>

<Form.Item label="VAD 阈值" name="qwen3VadThreshold">
  <div className="input-wrapper">
    <InputNumber min={0.1} max={0.9} step={0.05} />
    <span className="unit-text"></span> {/* 单位占位 */}
    <Tooltip title="...">
      <QuestionCircleOutlined className="tooltip-icon" />
    </Tooltip>
  </div>
</Form.Item>

// CSS
.input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-wrapper .ant-select,
.input-wrapper .ant-input-number {
  flex: 1; /* 自动填充剩余空间 */
}

.input-wrapper .unit-text {
  width: 32px;
  text-align: center;
  color: rgba(0, 0, 0, 0.45);
  font-size: 14px;
  flex-shrink: 0; /* 固定宽度 */
}

.input-wrapper .tooltip-icon {
  width: 24px;
  color: #999;
  cursor: help;
  font-size: 14px;
  flex-shrink: 0; /* 固定宽度 */
}
```

**理由：**
- ✓ 保留 Form.Item 的验证、错误提示、label 对齐功能
- ✓ 所有输入框长度完全一致（flex: 1 自动填充）
- ✓ 单位和 tooltip 位置固定，不影响输入框宽度
- ✓ 不使用 addonAfter，避免默认值显示问题
- ✓ 代码简洁清晰，易于维护
- ✓ 无论有无单位、有无 tooltip，布局结构统一

**布局结构：**
```
wrapperCol (70.8%)
├─ InputNumber (flex: 1) ≈ 60%
├─ unit-text (32px 固定)
├─ gap (8px × 2)
└─ tooltip-icon (24px 固定)
```

**备选方案（已放弃）：**
- 使用 addonAfter - 导致长度不一致
- 绝对定位单位标签 - 导致默认值不显示、按钮重叠
- CSS calc() hack - 代码复杂，难以维护
.input-with-unit .unit-label {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: rgba(0, 0, 0, 0.45);
  font-size: 14px;
}
```

**理由：**
- 所有输入框边框长度完全一致
- 单位显示在输入框内部右侧，不占用额外空间
- 不影响输入框的实际可用宽度
- `pointer-events: none` 确保单位标签不干扰输入交互

**备选方案：**
- 统一使用 addonAfter（包括空白 addon）- 增加不必要的 DOM 复杂度
- 使用 suffix 属性 - 会占用输入框内部空间，影响输入体验
- 固定输入框宽度让 addon 溢出 - CSS hack，不够优雅

## Risks / Trade-offs

**[风险] Tooltip 图标可能被 Modal 边界裁剪**
→ **缓解：** Modal 宽度为 600px，wrapperCol: 17 约 425px，加上 labelCol: 5 约 125px，总计 550px，剩余 50px 足够容纳 tooltip 图标（24px + 边距）

**[风险] 绝对定位可能在某些边缘情况下错位**
→ **缓解：** 使用 `transform: translateY(-50%)` 确保垂直居中，测试不同输入组件高度（InputNumber, Select）

**[权衡] LLM 配置标签页使用不同的 wrapperCol**
→ **接受：** 该标签页没有 tooltip，使用 wrapperCol: 18 可以更好利用空间，不影响其他标签页的一致性

**[权衡] 需要为每个有 tooltip 的 Form.Item 添加 className**
→ **接受：** 这是最简洁的实现方式，代码清晰易维护

## Migration Plan

无需迁移，纯 UI 调整，不影响数据和功能。

部署步骤：
1. 修改 SettingsModal.tsx 的布局配置
2. 添加 CSS 样式
3. 测试所有标签页的表单渲染
4. 验证 tooltip 交互正常

回滚策略：
- 如有问题，直接回退代码即可，无数据影响

## Open Questions

无
