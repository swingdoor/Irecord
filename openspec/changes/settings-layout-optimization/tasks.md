## 1. 重构实时录音标签页

- [x] 1.1 更新 CSS 样式：添加 `.input-wrapper`、`.unit-text`、`.tooltip-icon` 样式类
- [x] 1.2 重构"识别模型" Select：包装在 input-wrapper 中
- [x] 1.3 重构 Qwen3 "音频增益"：移除 addonAfter，使用 flex 布局 + 单位文本
- [x] 1.4 重构 Qwen3 "VAD 阈值"：移除绝对定位 tooltip，使用 flex 布局
- [x] 1.5 重构 Qwen3 "最短静音"：移除 addonAfter，使用 flex 布局 + 单位文本 + tooltip
- [x] 1.6 重构 Qwen3 "最长语音"：移除 addonAfter，使用 flex 布局 + 单位文本 + tooltip
- [x] 1.7 重构 Zipformer "音频增益"：移除 addonAfter，使用 flex 布局 + 单位文本
- [x] 1.8 重构 Zipformer "静音阈值1"：移除 addonAfter，使用 flex 布局 + 单位文本 + tooltip
- [x] 1.9 重构 Zipformer "静音阈值2"：移除 addonAfter，使用 flex 布局 + 单位文本 + tooltip
- [x] 1.10 重构 Zipformer "最长语音"：移除 addonAfter，使用 flex 布局 + 单位文本 + tooltip

## 2. 重构文件识别标签页

- [x] 2.1 更新 CSS 样式：添加 `.input-wrapper`、`.unit-text`、`.tooltip-icon` 样式类
- [x] 2.2 重构"默认模型" Select：包装在 input-wrapper 中
- [x] 2.3 重构"默认策略" Select：包装在 input-wrapper 中
- [x] 2.4 重构"聚类阈值"：使用 flex 布局 + 空单位占位 + tooltip
- [x] 2.5 重构"VAD 阈值"：使用 flex 布局 + 空单位占位 + tooltip
- [x] 2.6 重构"最短静音"：移除 addonAfter，使用 flex 布局 + 单位文本 + tooltip
- [x] 2.7 重构"最短语音"：移除 addonAfter，使用 flex 布局 + 单位文本 + tooltip
- [x] 2.8 重构"最长分段"：移除 addonAfter，使用 flex 布局 + 单位文本 + tooltip
- [x] 2.9 重构"最大时长"：移除 addonAfter，使用 flex 布局 + 单位文本 + tooltip

## 3. 重构 LLM 配置标签页

- [x] 3.1 调整 wrapperCol 为 17（与其他标签页保持一致）
- [x] 3.2 重构"模型厂商" Select：包装在 input-wrapper 中（可选，保持一致性）
- [x] 3.3 重构"模型" Select：包装在 input-wrapper 中（可选，保持一致性）
- [x] 3.4 重构"API Key" Input：包装在 input-wrapper 中（可选，保持一致性）

## 4. 清理旧代码

- [x] 4.1 移除所有旧的 CSS 规则（calc(100% - 40px)、绝对定位相关）
- [x] 4.2 确认所有 addonAfter 已移除
- [x] 4.3 确认所有绝对定位的 tooltip 已移除

## 5. 测试和验证

- [x] 5.1 验证实时录音标签页：所有输入框长度一致，默认值正常显示
- [x] 5.2 验证文件识别标签页：所有输入框长度一致，默认值正常显示
- [x] 5.3 验证 LLM 配置标签页：布局正确
- [x] 5.4 验证单位文本显示正确且位置固定
- [x] 5.5 验证 tooltip 图标显示正确且可交互
- [x] 5.6 验证表单功能正常（输入、验证、提交）
- [x] 5.7 验证不同窗口尺寸下的布局表现
