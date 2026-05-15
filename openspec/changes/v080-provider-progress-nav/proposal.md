## Why

iRecord 0.7.1 的 LLM 集成仅支持阿里百炼一家厂商，用户无法选择其他模型服务。同时文件转写过程中只显示"处理中"状态，用户无法了解实际进度。此外任务提交后需要手动切换 Tab 查看结果，体验不够流畅。0.8.0 版本解决这三个问题。

## What Changes

- 新增 LLM Provider 抽象层，将硬编码的阿里百炼调用重构为通用 OpenAI-compatible 客户端，支持多厂商注册
- 新增 DeepSeek 作为第二个模型厂商，提供 `deepseek-v4-flash` 和 `deepseek-v4-pro` 两个模型
- 设置面板中厂商与模型列表联动，每个厂商独立存储 API Key
- 文件转写过程中显示实时进度百分比（Tag + 阶段文字 + 百分比 + 进度条，水平排列）
- 文件转写任务提交后自动跳转到"文件上传"Tab，知识整理任务提交后自动跳转到"知识整理"Tab（后者已实现）

## Capabilities

### New Capabilities
- `llm-provider-abstraction`: LLM 厂商抽象层，支持多 Provider 注册、模型列表联动、独立 API Key 存储
- `transcription-progress`: 文件转写进度百分比展示，监听已有的 task-progress 事件并在 UI 中渲染
- `task-submit-navigation`: 任务提交后自动跳转到对应的列表 Tab

### Modified Capabilities

## Impact

- `src/main/llm/dashscope.ts` → 重构为 `providers.ts` + `client.ts`
- `src/main/utils/settings.ts` → AppSettings 接口扩展 `llmApiKeys` 字段
- `src/main/taskQueue.ts` → 更新 import 路径
- `src/main/ipc/` → 更新 LLM 相关 import
- `src/renderer/src/components/SettingsModal.tsx` → Provider 联动 UI
- `src/renderer/src/components/TaskTable.tsx` → 进度展示组件
- `src/renderer/src/pages/TaskListPage.tsx` → 监听 onTaskProgress + 自动跳转逻辑
- `src/preload/index.ts` → 可能需要新增 IPC 获取 provider 列表
