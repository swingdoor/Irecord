## Context

iRecord 是一个 Electron + React 本地语音转写工具。当前 LLM 集成通过 `src/main/llm/dashscope.ts` 硬编码调用阿里百炼 API。文件转写子进程已经通过 stdout JSON 消息上报进度（stage + percent），主进程通过 `task-progress` IPC 事件转发到渲染进程，但前端未监听该事件。任务提交后的 Tab 跳转逻辑在知识整理中已实现，文件上传缺失。

技术栈：Electron 41 + React 19 + Zustand + Ant Design 6 + Tailwind CSS。

## Goals / Non-Goals

**Goals:**
- 将 LLM 调用抽象为通用 OpenAI-compatible 客户端，支持通过注册表扩展新厂商
- 新增 DeepSeek 厂商支持（deepseek-v4-flash, deepseek-v4-pro）
- 每个厂商独立存储 API Key，切换厂商时模型列表联动
- 前端监听已有的 task-progress 事件，展示进度百分比
- 文件上传任务提交后自动切换到对应 Tab

**Non-Goals:**
- 不支持自定义 base URL（用户自建 API 代理）— 后续版本考虑
- 不支持流式输出（streaming）— 当前 AI 分析场景不需要
- 不修改 ASR 子进程的进度上报逻辑（已经足够完善）
- 不做 provider 的运行时动态加载（静态注册表足够）

## Decisions

### D1: Provider 注册表为静态配置

**选择**: 在 `src/main/llm/providers.ts` 中定义一个 `PROVIDERS` 常量对象，包含每个厂商的 id、name、baseUrl、models 列表。

**替代方案**: 
- 插件式动态加载 → 过度设计，当前只有 2 个厂商
- 数据库存储 → 不必要，厂商信息是代码级别的

**理由**: 两个厂商都是 OpenAI-compatible 格式，唯一差异是 baseUrl 和模型列表。静态配置简单、类型安全、零运行时开销。新增厂商只需在注册表中加一条记录。

### D2: 重命名 dashscope.ts → client.ts

**选择**: 将 `dashscope.ts` 重命名为 `client.ts`，内部逻辑改为从 providers 注册表查找 baseUrl，不再硬编码。

**替代方案**:
- 保留 dashscope.ts 并新建 deepseek.ts → 代码重复
- 创建 base class + 子类 → 过度抽象，两者接口完全一致

**理由**: 所有厂商共享同一个 HTTP 调用逻辑（OpenAI chat/completions 格式），差异仅在 URL 和 auth header。一个函数 + 配置查表即可。

### D3: API Key 存储结构

**选择**: 在 AppSettings 中新增 `llmApiKeys: Record<string, string>` 字段，key 为 provider id，value 为 API Key。保留旧的 `llmApiKey` 字段做向后兼容。

**迁移策略**: `client.ts` 读取 key 时：先查 `llmApiKeys[provider]`，若为空且 provider 为 dashscope，fallback 到 `llmApiKey`。

### D4: 进度展示在 TaskTable 组件内部

**选择**: 在 `TaskListPage` 中监听 `onTaskProgress`，维护 `taskProgress` state，作为 prop 传入 `TaskTable`。在 TaskTable 的状态列中，当 status 为 processing 且有进度数据时，渲染水平布局的进度信息。

**替代方案**:
- 在 appStore 中存储进度 → 进度是临时 UI 状态，不适合放全局 store
- 在 TaskTable 内部监听 IPC → 组件职责不清晰

**理由**: 进度数据生命周期短（仅 processing 期间），由页面级组件管理并通过 prop 下传，符合 React 数据流。

### D5: 进度条使用 Ant Design Progress 组件

**选择**: 使用 `<Progress percent={n} size="small" showInfo={false} />` 内联在状态列中，宽度约 80-100px。

**理由**: 项目已使用 Ant Design，保持一致性。`size="small"` 提供紧凑的细条样式，适合表格内嵌。

## Risks / Trade-offs

- [兼容性] 旧设置文件无 `llmApiKeys` 字段 → 通过 fallback 到 `llmApiKey` 缓解，无需强制迁移
- [进度精度] asr-process 的进度是估算值（基于已处理段落数/总段落数）→ 可接受，用户只需要大致感知
- [Tab 跳转体验] 用户可能不希望被强制跳转 → 仅在成功添加任务时跳转，取消或失败不跳转
