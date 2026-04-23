## Why

当前设置页面的分组不够清晰，"基础配置"混合了路径配置和模型选择，"识别参数"只针对文件识别但命名不明确。用户需要更直观的分组来快速找到对应功能的设置项。

## What Changes

- 将设置页面的 4 个 Tab 重新分组为 5 个：基础设置、实时录音、文件识别、LLM 配置、快捷键
- "基础设置" 只保留路径配置（模型文件夹、FFmpeg 文件夹）
- "文件识别" 合并原"基础配置"中的模型/策略选择和原"识别参数"的所有参数
- "实时录音" 保持不变
- "LLM 配置" 保持不变
- 新增"快捷键" Tab，显示当前快捷键（暂不支持自定义）

## Capabilities

### New Capabilities
- `settings-tabs-regroup`: 设置页面 Tab 分组重构

### Modified Capabilities
<!-- 无需求变更，只是 UI 重组 -->

## Impact

- 影响文件：`src/renderer/src/components/SettingsModal.tsx`
- 不影响 settings 存储结构，只调整 UI 展示
- 用户体验改进：更清晰的功能分组
