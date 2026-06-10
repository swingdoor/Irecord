## 1. 清理上层调用（断开浮动/快捷键入口）

- [x] 1.1 `index.ts` 删除 `import globalShortcuts`、`registerRecordingShortcut` 调用与 `unregisterRecordingShortcut` 调用
- [x] 1.2 `index.ts` 删除不再使用的 `globalShortcut` electron 导入（如无其他用途）
- [x] 1.3 `App.tsx` 删除 `import FloatingRecorderPage`、`isFloatingRecorder` 判断与浮动路由分支
- [x] 1.4 `preload/index.ts` 删除 `startFloatingRecording`/`stopFloatingRecording`/`onShortcutStopRecording`/`onRequestCloseConfirmation`/`closeFloatingRecorder`
- [x] 1.5 编译验证：`npm run build` 通过（此时 handler 仍在但无调用方）

## 2. 改造录音状态判断（删独立状态机）

- [x] 2.1 `recordingHandlers.ts` 删除 `canStartRecording`/`setRecordingState`/`getRecordingState`/`closeFloatingRecorder` 的 import
- [x] 2.2 `start-recording` handler：开始前判断改为 `if (audioRecorder) return { error: '已有录音正在进行中' }`，删除 setRecordingState 调用
- [x] 2.3 `stop-recording` handler：删除 setRecordingState 调用（状态由 audioRecorder = null 表达）
- [x] 2.4 删除 `start-floating-recording`/`stop-floating-recording`/`close-floating-recorder` 三个 handler
- [x] 2.5 编译验证：`npm run build` 通过

## 3. 删除浮动/快捷键文件

- [x] 3.1 删除 `src/main/windows/floatingRecorder.ts`
- [x] 3.2 删除 `src/main/shortcuts/globalShortcuts.ts`
- [x] 3.3 删除 `src/renderer/src/pages/FloatingRecorderPage.tsx`
- [x] 3.4 删除 `src/renderer/src/components/RecordingSaveDialog.tsx`
- [x] 3.5 删除 `src/renderer/src/components/RecordingModal.tsx`（死代码）
- [x] 3.6 全局搜索确认无残留 import 引用上述文件
- [x] 3.7 编译验证：`npm run build` 通过

## 4. 清理实时引擎残留

- [x] 4.1 `engines.ts` 删除 `streaming-zipformer` 与 `qwen3-simulated-streaming` 两个 realtime 引擎条目
- [x] 4.2 `engines.ts` 删除 `getRealtimeModelIds`/`getRealtimeModels`（确认无其他引用后）
- [x] 4.3 `engines.ts` 的 `EngineEntry.type` 若仅剩 'offline' 可简化（可选）
- [x] 4.4 `registry.ts` 删除 `streaming-zipformer-zh` 模型条目
- [x] 4.5 `settingsHandlers.ts` 删除 `getRealtimeModels` import、`realtimeModels` 计算与 get-model-registry 返回字段
- [x] 4.6 `preload/index.ts` 的 `getModelRegistry` 返回类型删除 `realtimeModels` 字段
- [x] 4.7 `SettingsModal.tsx` 删除 `realtimeModels` state、解构与"实时转写模型"分组渲染
- [x] 4.8 编译验证：`npm run build` 通过

## 5. 清理 useRecording 旧设置读取

- [x] 5.1 `useRecording.ts` 删除 `settings.realtimeEngineConfig`/`qwen3Params`/`zipformerParams`/`realtimeParams` 读取
- [x] 5.2 audioGain 改为固定值（如 2.0）或从新的后处理无关配置读取
- [x] 5.3 编译验证：`npm run build` 通过

## 6. 数据层：转写用原始音频契约

- [x] 6.1 `recordingHandlers.ts` 的 `create-proofreading-task` 改为优先用 `recording.originalFilePath`，回退 `filePath`
- [x] 6.2 `save-realtime-recording` handler 增加 `originalFilePath` 与 `postProcessing` 参数透传到 `createRealtimeRecording`
- [x] 6.3 确认 `createRealtimeRecording` 已支持这两个字段（上个 change 已加，复核即可）

## 7. 后处理 IPC 改为用户主动触发

- [x] 7.1 `recordingHandlers.ts` 的 `stop-recording` 移除自动后处理逻辑，仅 finalize 返回原始 WAV 信息
- [x] 7.2 新增 `process-recording` IPC handler，接收 `{ filePath, options }`，调用现有 `processRecording()`
- [x] 7.3 `process-recording` 通过 `postprocessing-progress`/`postprocessing-complete`/`postprocessing-error` 推送状态
- [x] 7.4 `preload/index.ts` 暴露 `processRecording(filePath, options)` 调用接口
- [x] 7.5 编译验证：`npm run build` 通过

## 8. RecordingPage 四阶段工作流重构

- [x] 8.1 引入 stage 状态：`recording | paused | stopped | processing | done`，由 useRecording 的 status 与本地 stage 协同
- [x] 8.2 阶段① 录音中：保持纯净，仅波形+计时+暂停/停止，移除"识别结果"占位 Card
- [x] 8.3 阶段② 配置：停止后显示原始 WAV 的 AudioPlayer 试听区
- [x] 8.4 阶段② 配置：显示后处理开关面板（5 开关），初始值取自 getSettings().recordingPostProcessing
- [x] 8.5 阶段② 配置：显示"同时创建高精度转写"勾选（默认勾选）
- [x] 8.6 阶段② 配置：保存按钮逻辑——勾了后处理走阶段③，没勾直接阶段④
- [x] 8.7 阶段③ 处理中：进度条 + 当前步骤文案，订阅 postprocessing-progress
- [x] 8.8 阶段③ 处理中：原始试听仍可用
- [x] 8.9 阶段④ 完成：成品 AudioPlayer + （保留原始时）原始 AudioPlayer 并列对比
- [x] 8.10 阶段④ 完成：体积对比提示（成品 vs 原始）
- [x] 8.11 阶段④ 完成：转写任务状态提示 + 去任务列表入口
- [x] 8.12 后处理失败降级：done 阶段提示失败，保存用原始 WAV
- [x] 8.13 保存流程：调用 saveRealtimeRecording 传入 filePath/originalFilePath/postProcessing
- [x] 8.14 编译验证：`npm run build` 通过

## 9. 测试与验证

- [ ] 9.1 手测：录音中界面纯净，无后处理选项
- [ ] 9.2 手测：停止后进入配置阶段，可试听原始
- [ ] 9.3 手测：不勾后处理直接保存 → 完成阶段成品=原始
- [ ] 9.4 手测：勾压缩 → 处理进度 → 完成阶段成品/原始对比试听
- [ ] 9.5 手测：勾降噪+保留原始 → A/B 对比能听出降噪差异
- [ ] 9.6 手测：勾"同时创建转写" → 转写任务用原始 WAV，任务列表可见
- [ ] 9.7 手测：取消保留原始 → 转写提示用压缩音频
- [ ] 9.8 手测：后处理失败 → 降级用原始保存
- [ ] 9.9 手测：模型管理页不再显示"实时转写模型"分组
- [ ] 9.10 回归：离线转写、说话人分离、AI 分析、知识模块不受影响
- [ ] 9.11 打包验证：`npm run build:win` 成功，无浮动/快捷键残留

## 10. 文档与清理

- [x] 10.1 删除根目录临时文档（FINAL_REPORT.md / VERIFICATION_REPORT.md / IMPLEMENTATION_STATUS.md / COMPLETION_REPORT.md / DONE.md / URGENT_FIX.md / BUGFIX_LOG.md / TASKS_COMPLETE.txt）
- [x] 10.2 全局搜索确认无 floating/shortcut/realtimeEngine/streaming-zipformer 残留
- [ ] 10.3 更新用户文档（如有）说明录音工作流与后处理
