## Why

设置页面的表单布局存在视觉不平衡问题：左侧标签列留白过大（占 25%），输入框长度不一致（有 tooltip 的项被压缩），tooltip 图标嵌入在输入框内部导致对齐混乱。这影响了用户体验和视觉一致性。

## What Changes

- 减少表单标签列宽度，从 `labelCol: 6` 改为 `labelCol: 5`
- 统一所有输入框/下拉框的宽度为 `wrapperCol: 17`
- 将 tooltip 图标从输入框内部移到右侧独立位置（使用绝对定位）
- 确保所有表单项（无论是否有 tooltip）的输入框长度完全一致

## Capabilities

### New Capabilities
- `settings-form-layout`: 设置页面表单的统一布局规范，包括标签列宽度、输入框宽度、tooltip 位置等

### Modified Capabilities
<!-- 无现有功能需求变更，仅优化 UI 布局 -->

## Impact

**受影响的文件：**
- `src/renderer/src/components/SettingsModal.tsx` - 需要修改所有标签页的 Form 布局配置和 tooltip 实现

**受影响的标签页：**
- 实时录音（多个带 tooltip 的输入项）
- 文件识别（多个带 tooltip 的输入项）
- LLM 配置（需要统一布局）

**视觉影响：**
- 表单更紧凑，左侧留白减少
- 所有输入框视觉对齐，长度一致
- Tooltip 图标位置统一在输入框右侧
