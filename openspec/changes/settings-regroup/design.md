## Context

设置页面当前有 4 个 Tab（基础配置、识别参数、LLM 配置、实时录音），分组不够直观。需要重组为 5 个 Tab，只涉及 SettingsModal.tsx 的 UI 调整，不改变 settings 存储结构。

## Goals / Non-Goals

**Goals:**
- 将设置项按功能重新分组为 5 个 Tab
- 新增快捷键 Tab（只读展示）

**Non-Goals:**
- 不修改 settings 存储结构
- 不实现快捷键自定义功能

## Decisions

### Tab 结构调整

将现有 Tab 内容重新分配：

| Tab | 内容 | 来源 |
|-----|------|------|
| 基础设置 | 模型文件夹、FFmpeg 文件夹 | 原"基础配置"部分字段 |
| 实时录音 | 识别引擎、引擎参数 | 原"实时录音"不变 |
| 文件识别 | 默认模型、默认策略、全部 ASR 参数 | 原"基础配置"部分字段 + 原"识别参数"全部 |
| LLM 配置 | 厂商、模型、API Key | 不变 |
| 快捷键 | 显示 Ctrl+Shift+R（只读） | 新增 |

只修改 `src/renderer/src/components/SettingsModal.tsx`。

## Risks / Trade-offs

无风险，纯 UI 重组。
