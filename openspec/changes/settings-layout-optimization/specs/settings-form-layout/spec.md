## ADDED Requirements

### Requirement: Form label column width
设置页面的表单标签列 SHALL 使用 `labelCol={{ span: 5 }}` 配置，占据 5/24 (约 20.8%) 的宽度。

#### Scenario: Label column renders with correct width
- **WHEN** 设置页面的任何标签页渲染表单
- **THEN** 标签列宽度为 5/24，减少左侧留白

### Requirement: Form input column width
设置页面的所有输入框/下拉框 SHALL 使用统一的 `wrapperCol={{ span: 17 }}` 配置，占据 17/24 (约 70.8%) 的宽度。

#### Scenario: All inputs have consistent width
- **WHEN** 设置页面渲染包含多个表单项的标签页
- **THEN** 所有输入框和下拉框的宽度完全一致，无论是否有 tooltip

#### Scenario: Input width not affected by tooltip
- **WHEN** 表单项包含 tooltip 图标
- **THEN** 输入框宽度与没有 tooltip 的表单项保持一致

### Requirement: Tooltip icon positioning
带有 tooltip 的表单项 SHALL 将 tooltip 图标放置在输入框右侧的独立位置，不占用输入框空间。

#### Scenario: Tooltip icon positioned outside input
- **WHEN** 表单项包含 tooltip 图标
- **THEN** tooltip 图标显示在输入框右侧（wrapperCol 外部），使用绝对定位

#### Scenario: Tooltip icon vertically centered
- **WHEN** tooltip 图标渲染
- **THEN** 图标垂直居中对齐输入框

#### Scenario: Tooltip icon has hover state
- **WHEN** 用户鼠标悬停在 tooltip 图标上
- **THEN** 显示 tooltip 提示内容，图标显示 help 光标样式

### Requirement: Form item styling consistency
所有表单项 SHALL 使用统一的样式类和间距配置。

#### Scenario: Form items have consistent spacing
- **WHEN** 设置页面渲染表单
- **THEN** 所有表单项的 `marginBottom` 为 12px

#### Scenario: Tooltip icon has consistent styling
- **WHEN** tooltip 图标渲染
- **THEN** 图标颜色为 #999，光标为 help，位置在输入框右侧 8px 处

### Requirement: Layout applies to all settings tabs
表单布局规范 SHALL 应用于设置页面的所有标签页。

#### Scenario: Realtime recording tab uses new layout
- **WHEN** 用户打开"实时录音"标签页
- **THEN** 表单使用 labelCol: 5, wrapperCol: 17 配置

#### Scenario: File recognition tab uses new layout
- **WHEN** 用户打开"文件识别"标签页
- **THEN** 表单使用 labelCol: 5, wrapperCol: 17 配置

#### Scenario: LLM config tab uses new layout
- **WHEN** 用户打开"LLM 配置"标签页
- **THEN** 表单使用 labelCol: 5, wrapperCol: 18 配置（因为没有 tooltip 需要额外空间）
