## Summary

**Core Implementation Complete: 36/75 tasks (48%)**

### ✅ Completed Backend Work
- AudioRecorder module (decoupled from transcription)
- Removed all realtime transcription engines
- Updated all IPC handlers to use AudioRecorder
- Removed transcription IPC channels
- Postprocessing pipeline with ffmpeg
- Database schema updated (originalFilePath, postProcessing fields)
- Settings migrated (removed realtimeEngineConfig, added recordingPostProcessing)

### 🔧 Remaining Integration Tasks

The following tasks need to be completed to have a fully functional system. Most are UI updates and can be done incrementally:

**Group 5 (UI - Recording Modal)**: Tasks 5.4-5.8
- Add postprocessing checkboxes to RecordingModal
- Read settings for default values
- Handle processing state with progress bar

**Group 7 (Backend Integration)**: Tasks 7.1-7.5
- Wire `processRecording()` into stop-recording handlers
- Add postprocessing IPC events (progress/complete/error)
- Update preload and RecordingModal to handle events

**Group 8**: Task 8.4
- Update save-realtime-recording to pass postprocessing config

**Group 9 (UI - Settings)**: Tasks 9.4-9.5
- Remove realtime engine UI from SettingsModal
- Add postprocessing settings panel

**Groups 10-12 (UI Polish)**: Tasks 10.1-12.4
- Detail page updates
- Floating recorder sync
- Error handling

**Group 13 (Testing)**: Tasks 13.1-13.9
- Manual testing of all flows

**Group 14 (Docs)**: Tasks 14.1-14.4
- Update README
- Code cleanup

### 🚀 Current Status

**What works now:**
- Recording (no transcription)
- Waveform visualization
- Pause/resume/stop
- Returns file path on stop

**What needs wiring:**
- Postprocessing integration (Group 7)
- UI for postprocessing controls (Groups 5, 9)
- Settings UI cleanup (Group 9)

The architecture is solid and all core components are implemented. Remaining work is primarily integration and UI polish.

---

## Detailed Tasks Below (For Reference)

## 1. AudioRecorder 独立抽取（录音与转写解耦）

- [x] 1.1 新建 `src/main/audio/AudioRecorder.ts`，实现纯 WAV 流式写入逻辑（initialize/feedAudio/finalize/cleanup）
- [x] 1.2 从 `realtime-recognizer.ts:111-114` 与 `finalize()` 中提取 WAV 写盘与补头代码迁移至 AudioRecorder
- [x] 1.3 AudioRecorder.finalize 返回 `{ filePath: string, duration: number, fileSize: number }`（不含 segments）
- [x] 1.4 AudioRecorder 内部维护录音时长上限（120 分钟），达到后自动触发 finalize
- [ ] 1.5 添加 AudioRecorder 单元测试（喂入 mock 音频块验证 WAV 完整性）

## 2. 移除实时转写引擎与相关代码

- [x] 2.1 删除 `src/main/engine/realtime-recognizer.ts`
- [x] 2.2 删除 `src/main/engine/qwen3-realtime-recognizer.ts`
- [x] 2.3 简化 `src/main/engine/IRealtimeRecognizer.ts` 或删除（若无其他引用）
- [x] 2.4 删除 `src/renderer/src/components/RealtimeTranscript.tsx`
- [x] 2.5 从 `src/main/utils/paths.ts` 移除流式模型路径获取与校验函数（`getStreamingZipformerModelPath` / `checkStreamingZipformerModelExists` 等）
- [x] 2.6 从 `package.json` 的 `build.extraResources` 移除 `sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30`

## 3. 改造 recordingHandlers.ts 使用 AudioRecorder

- [x] 3.1 导入 AudioRecorder 替换 IRealtimeRecognizer / RealtimeRecognizer / Qwen3RealtimeRecognizer 引用
- [x] 3.2 `start-recording` handler 中创建 AudioRecorder 实例（删除 recognizer 初始化与模型校验逻辑）
- [x] 3.3 `audio-chunk` handler 改为仅调用 `audioRecorder.feedAudio(audioData)`，移除实时识别解码与结果推送
- [x] 3.4 `stop-recording` handler 改为调用 `audioRecorder.finalize()`，返回 `{ filePath, duration, fileSize }`（不含 text/segments）
- [x] 3.5 `start-floating-recording` / `stop-floating-recording` 同步改造为使用 AudioRecorder
- [x] 3.6 从 recordingHandlers 移除 `currentModelType` 变量（录音不再需要记录模型类型）

## 4. 移除实时转写 IPC 通道

- [x] 4.1 从 `src/main/ipc/recordingHandlers.ts` 移除 `realtime-result` / `segment-complete` / `recording-error`(转写部分) 事件发送
- [x] 4.2 从 `src/preload/index.ts` 移除 `onRealtimeResult` / `onSegmentComplete` / `checkStreamingModel` 暴露
- [x] 4.3 从 `src/renderer/src/types/electron.d.ts` 移除对应类型定义（自动继承自 preload）

## 5. 改造录音界面（移除文字区 + 新增后处理面板）

- [x] 5.1 `RecordingModal.tsx` 移除 `RealtimeTranscript` 组件引用与 `segments` / `currentText` 状态
- [x] 5.2 `useRecording.ts` 移除实时结果监听（`onRealtimeResult` / `onSegmentComplete` 订阅）
- [x] 5.3 `useRecording.ts` 的 `stop()` 改为仅返回 `{ filePath, duration, fileSize }`，移除 `text` / `segments` / `wordCount`
- [ ] 5.4 `RecordingModal.tsx` 新增后处理开关面板（降噪/静音裁剪/响度归一/压缩编码/保留原始 WAV）五个 Checkbox
- [ ] 5.5 面板开关初始值从 `getSettings().recordingPostProcessing` 读取（全局默认）
- [ ] 5.6 用户修改面板开关时更新局部状态（不写入全局设置）
- [ ] 5.7 录音状态机增加 `processing` 状态，stop 后若有后处理则进入 processing，否则直接 done
- [ ] 5.8 在 `processing` 状态显示进度条与百分比，禁用保存/关闭按钮
- [ ] 5.4 `RecordingModal.tsx` 新增后处理开关面板（降噪/静音裁剪/响度归一/压缩编码/保留原始 WAV）五个 Checkbox
- [ ] 5.5 面板开关初始值从 `getSettings().recordingPostProcessing` 读取（全局默认）
- [ ] 5.6 用户修改面板开关时更新局部状态（不写入全局设置）
- [ ] 5.7 录音状态机增加 `processing` 状态，stop 后若有后处理则进入 processing，否则直接 done
- [ ] 5.8 在 `processing` 状态显示进度条与百分比，禁用保存/关闭按钮

## 6. 后处理流水线实现

- [x] 6.1 新建 `src/main/audio/postProcessing.ts`，导出 `processRecording(filePath, options)` 异步函数
- [x] 6.2 根据 options（denoise/trimSilence/normalizeLoudness/compress）动态拼接 ffmpeg `-af` 滤镜链字符串
- [x] 6.3 滤镜顺序固定为 `afftdn → silenceremove → loudnorm`（跳过未勾选项）
- [x] 6.4 如勾选 compress，确定输出格式（m4a 或 mp3）与编码器参数（-c:a aac -b:a 64k 或 -c:a libmp3lame）
- [x] 6.5 启用 `-progress pipe:1` 并解析 ffmpeg 输出，计算进度百分比
- [x] 6.6 通过 IPC 事件 `postprocessing-progress` 每 500ms 推送 `{ recordingId?, progress: 0..1 }`
- [x] 6.7 ffmpeg 完成后返回成品路径与 fileSize；失败则抛出错误（原始 WAV 不删除）
- [x] 6.8 如 options.keepOriginal 为 false 且处理成功，删除原始 WAV（`unlinkSync`）

## 7. 录音后处理集成到 recordingHandlers

- [ ] 7.1 `stop-recording` / `stop-floating-recording` 改为调用 `processRecording` 在后台执行，立即返回原始文件信息（需要先获取用户后处理配置）
- [ ] 7.2 注册 `postprocessing-progress` / `postprocessing-complete` / `postprocessing-error` IPC 事件发送到 Renderer
- [ ] 7.3 Preload 暴露 `onPostprocessingProgress` / `onPostprocessingComplete` / `onPostprocessingError` 监听函数
- [ ] 7.4 `RecordingModal.tsx` 订阅后处理事件，更新进度条与最终状态
- [ ] 7.5 后处理完成后更新 Modal 的 `filePath` 为成品路径，进入 done 状态可保存

## 8. 录音记录数据模型扩展

- [x] 8.1 `src/main/db/database.ts` 的 `RealtimeRecording` 接口增加可选字段 `originalFilePath?: string` 与 `postProcessing?: {...}`
- [x] 8.2 `createRealtimeRecording` 允许传入这两个可选字段
- [x] 8.3 数据库建表 SQL（如有初始化脚本）增加对应列（可为 NULL）
- [ ] 8.4 `save-realtime-recording` handler 传入后处理配置与原始路径（如果保留）

## 9. 设置项迁移

- [x] 9.1 从 `src/main/utils/settings.ts` 的 `Settings` 类型移除 `realtimeEngineConfig` 及相关类型定义
- [x] 9.2 新增 `recordingPostProcessing` 字段到 `Settings` 类型，包含 denoise/trimSilence/normalizeLoudness/compress/compressFormat/keepOriginal
- [x] 9.3 `getSettings()` 中如果 `recordingPostProcessing` 不存在则填充默认值（compress: true, 其余 false, compressFormat: 'm4a'）
- [ ] 9.4 `SettingsModal.tsx` 移除实时转写引擎配置项 UI（zipformer/qwen3 参数面板）
- [ ] 9.5 `SettingsModal.tsx` 新增"录音后处理"设置组，显示五个开关与压缩格式下拉

## 10. 录音详情页与列表交互

- [ ] 10.1 `RealtimeRecordingDetailPage.tsx` 移除转写文本与分段显示（如原先有实时转写结果展示）
- [ ] 10.2 详情页显示后处理信息（若 `postProcessing` 字段存在）：已应用的处理项标签
- [ ] 10.3 详情页保留"一键高质量转写"按钮（`create-proofreading-task`），点击提交成品文件到任务队列
- [ ] 10.4 如果 `originalFilePath` 存在，详情页新增"恢复原始录音"或"查看原始文件"入口（可选）

## 11. 浮动录音窗口同步

- [ ] 11.1 `FloatingRecorderPage.tsx` 移除实时转写文本显示组件
- [ ] 11.2 浮动窗口录音停止后使用全局默认后处理配置（不提供临时覆盖面板）
- [ ] 11.3 浮动窗口显示简化的后处理进度提示（如"处理中..."无详细百分比）
- [ ] 11.4 `RecordingSaveDialog.tsx` 保持不变（标题/是否创建转写任务逻辑不受影响）

## 12. 错误处理与边界情况

- [ ] 12.1 启动时检测 `getFfmpegPath()` 文件是否存在，不存在则禁用后处理面板并提示
- [ ] 12.2 后处理失败时，确保原始 WAV 不被删除，向用户提示"后处理失败，已保留原始录音"
- [ ] 12.3 用户在后处理进行中尝试关闭应用时，拦截退出并弹窗警告"录音处理中，是否等待？"
- [ ] 12.4 AudioRecorder 达到 120 分钟上限时自动停止，推送通知到 Renderer 提示用户

## 13. 测试与验证

- [ ] 13.1 手动测试：录音停止后不勾选任何后处理，验证直接保存原始 WAV
- [ ] 13.2 手动测试：仅勾选压缩编码，验证生成 M4A 且体积显著小于原始 WAV
- [ ] 13.3 手动测试：勾选降噪+响度归一+压缩，验证单条 ffmpeg 命令正确执行且进度推送正常
- [ ] 13.4 手动测试：勾选"保留原始"，验证原始与成品同时保存，详情页能区分
- [ ] 13.5 手动测试：不勾选"保留原始"，验证后处理成功后原始 WAV 被删除
- [ ] 13.6 手动测试：后处理失败（如 ffmpeg 参数错误），验证原始 WAV 未删且有错误提示
- [ ] 13.7 手动测试：从录音详情页提交"一键高质量转写"，验证离线任务队列正常接收成品文件
- [ ] 13.8 手动测试：浮动录音窗口录音并自动应用全局默认后处理
- [ ] 13.9 回归测试：离线转写任务队列、说话人分离、AI 分析功能不受影响

## 14. 文档与清理

- [ ] 14.1 更新 README 或用户文档，说明实时转写已移除，推荐使用离线高质量转写
- [ ] 14.2 清理代码中残留的实时转写注释或 TODO 标记
- [ ] 14.3 检查是否有其他文件引用已删除的 realtime-recognizer / qwen3-realtime-recognizer，确保无遗漏
- [ ] 14.4 打包验证：构建 Windows 安装包，确认体积减少 ~100MB 且不含流式模型
