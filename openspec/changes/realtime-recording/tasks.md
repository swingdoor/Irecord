## 1. 流式识别引擎（Main 进程）

- [x] 1.1 创建 src/main/engine/realtime-recognizer.ts，封装 OnlineRecognizer 生命周期（初始化、喂入音频、解码、获取结果、端点检测、重置、销毁）
- [x] 1.2 实现流式模型检测逻辑：检查 streaming-zipformer 模型目录是否存在（encoder.onnx / decoder.onnx / joiner.onnx / tokens.txt）
- [x] 1.3 实现音频缓冲管理：累积 Float32Array 块，录音停止后合并并写入 WAV 文件到 userData/recordings/
- [x] 1.4 实现 30 分钟录音时长限制，达到上限时自动触发停止

## 2. IPC 通道与 Preload

- [x] 2.1 在 src/main/ipc.ts 中注册录音相关 IPC handler：start-recording、stop-recording、check-streaming-model
- [x] 2.2 在 src/main/ipc.ts 中注册 audio-chunk 监听（ipcMain.on，单向传输）
- [x] 2.3 实现 Main → Renderer 推送：realtime-result（中间结果）、segment-complete（句子完成）、recording-error（错误）
- [x] 2.4 在 src/preload/index.ts 中暴露录音 API：startRecording、stopRecording、sendAudioChunk、onRealtimeResult、onSegmentComplete、onRecordingError、checkStreamingModel

## 3. 录音 UI 组件

- [x] 3.1 创建 src/renderer/src/hooks/useRecording.ts：录音状态管理 hook（状态机：idle → initializing → recording → paused → stopped），封装 getUserMedia、ScriptProcessorNode、音频块发送逻辑
- [x] 3.2 创建 src/renderer/src/components/WaveformVisualizer.tsx：Canvas 实时音频波形可视化组件
- [x] 3.3 创建 src/renderer/src/components/RealtimeTranscript.tsx：实时转写文本显示组件（已完成句子带时间戳 + 当前识别中句子带闪烁光标 + 自动滚动）
- [x] 3.4 创建 src/renderer/src/components/RecordingModal.tsx：录音主 Modal，组合波形、转写、控制按钮（开始/暂停/继续/停止）、时长计时器、状态指示器
- [x] 3.5 在 RecordingModal 中实现录音结果展示模式：停止后显示完整转写文本，提供复制、导出、深度分析按钮

## 4. 页面集成

- [x] 4.1 修改 src/renderer/src/components/FeatureCards.tsx：激活"实时录音"卡片，点击触发 onRecord 回调
- [x] 4.2 修改 src/renderer/src/pages/TaskListPage.tsx：添加 RecordingModal 状态管理，FeatureCards 传入 onRecord 打开 Modal
- [x] 4.3 实现"深度分析"功能：点击按钮时调用 addDroppedFiles 将录音 WAV 文件提交到任务队列，关闭 Modal

## 5. 设置与模型管理

- [x] 5.1 在 SettingsModal 中添加流式模型路径配置项，与现有模型路径配置风格一致
- [x] 5.2 在 checkResources 或独立接口中检测流式模型可用性，录音入口根据模型是否存在显示状态
