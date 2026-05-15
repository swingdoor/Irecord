## 1. LLM Provider 抽象层

- [x] 1.1 创建 `src/main/llm/providers.ts`：定义 LLMProvider 接口和 PROVIDERS 注册表（dashscope + deepseek），导出 getProvider / getProviderList 工具函数
- [x] 1.2 重构 `src/main/llm/dashscope.ts` → `src/main/llm/client.ts`：callLLM 从 providers 注册表查找 baseUrl，支持任意 OpenAI-compatible 厂商
- [x] 1.3 扩展 `src/main/utils/settings.ts`：AppSettings 接口新增 `llmApiKeys: Record<string, string>` 字段
- [x] 1.4 `client.ts` 中实现 API Key 读取逻辑：优先 `llmApiKeys[provider]`，fallback 到旧 `llmApiKey`（仅 dashscope）
- [x] 1.5 更新所有 import 引用：`taskQueue.ts`、`ipc/` 中的 `dashscope` → `client`

## 2. 设置面板 Provider 联动

- [x] 2.1 新增 IPC handler `get-llm-providers`：返回 provider 列表及其模型（或直接在 preload 中硬编码，由前端 import providers 配置）
- [x] 2.2 重构 `SettingsModal.tsx` LLM 配置 Tab：Provider 下拉联动模型列表，切换 provider 时重置模型为该 provider 的第一个
- [x] 2.3 实现独立 API Key 存储 UI：切换 provider 时显示对应的 API Key，保存时写入 `llmApiKeys[provider]`
- [x] 2.4 处理向后兼容：加载设置时若 `llmApiKeys` 为空但 `llmApiKey` 存在，自动填充到 `llmApiKeys.dashscope`

## 3. 转写进度百分比展示

- [x] 3.1 在 `TaskListPage.tsx` 中添加 `onTaskProgress` 监听，维护 `taskProgress: Record<string, { stage: string; percent: number }>` state
- [x] 3.2 将 `taskProgress` 作为 prop 传入 `TaskTable` 组件
- [x] 3.3 在 `TaskTable.tsx` 中新增 `TaskProgress` 内联组件：水平排列 stage 文字 + 百分比 + Progress 进度条
- [x] 3.4 修改状态列渲染：processing 状态时显示 Tag + TaskProgress + ProcessingTimer（水平排列）
- [x] 3.5 实现进度清理：当 task-status-changed 事件到来且状态非 processing 时，从 taskProgress 中移除该 taskId

## 4. 任务提交自动跳转

- [x] 4.1 修改 `handleAddFiles`：当 `result.tasks?.length > 0` 时调用 `setActiveTab('upload')` 并持久化
- [x] 4.2 修改 `handleDrop`：同上逻辑
- [x] 4.3 验证知识整理跳转逻辑（`handleDocCreated`）已正确工作，无需修改

## 5. 收尾

- [x] 5.1 更新 `package.json` 版本号为 `0.8.0`
- [x] 5.2 运行 typecheck 确认无类型错误
- [x] 5.3 手动测试：切换 provider、保存 key、文件转写进度显示、Tab 跳转
