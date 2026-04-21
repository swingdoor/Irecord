## Context

IRecord 是一个基于 Electron + React 的本地离线语音转写工具。当前架构：

- **识别引擎**：sherpa-onnx-node 的 OfflineRecognizer，在子进程（asr-process.js）中运行，支持 Qwen3-ASR 和 SenseVoice-Small
- **任务队列**：单线程队列（taskQueue.ts），逐个处理文件转写任务
- **IPC 模式**：Renderer ↔ Main 通过 ipcRenderer.invoke / ipcMain.handle 通信
- **UI**：两页 SPA（TaskListPage / TaskDetailPage），FeatureCards 中已有"实时录音"占位卡片（disabled）
- **音频处理**：FFmpeg 转换为 16kHz mono WAV 后送入识别

sherpa-onnx-node v1.12.38 已内置 OnlineRecognizer 类，支持流式识别。API：createStream → acceptWaveform → isReady → decode → getResult → isEndpoint → reset。需要 Transducer 架构模型（encoder + decoder + joiner）。

## Goals / Non-Goals

**Goals:**
- 用户可以在应用内直接录音，实时看到转写文本（延迟 < 500ms）
- 录音完成后可复制/导出实时识别结果
- 用户可手动将录音文件提交到现有任务队列进行深度分析（说话人分离、AI 分析等）
- 完全离线运行，与现有产品定位一致
- UI 风格与现有界面一致（Ant Design 组件）

**Non-Goals:**
- 不自动创建任务——实时录音是轻量即时工具，深度分析由用户主动触发
- 不实现实时说话人分离（流式模型不支持）
- 不实现实时字幕功能（独立 feature，后续单独做）
- 不支持 GPU 加速
- 不修改现有文件转写流程

## Decisions

### D1: 流式识别在 Main 进程内运行，不使用子进程

**选择**：在 Main 进程中直接实例化 OnlineRecognizer

**理由**：
- 流式识别需要持续喂入音频块并快速返回结果，子进程 IPC 会增加延迟
- OnlineRecognizer 是轻量级操作（每次 decode 耗时极短），不会阻塞 Main 进程
- 与现有 OfflineRecognizer（子进程）形成互补，互不干扰

**备选**：在子进程中运行流式识别 → 增加 IPC 延迟和复杂度，不适合实时场景

### D2: 音频捕获使用 ScriptProcessorNode

**选择**：Renderer 进程使用 getUserMedia + ScriptProcessorNode（bufferSize=4096）

**理由**：
- 兼容性好，Electron 完全支持
- 4096 samples @ 16kHz = 256ms 一个块，延迟可接受
- 实现简单，无需额外配置

**备选**：AudioWorklet → 性能更好但需要额外的 worklet 文件和配置，Phase 2 可优化

### D3: 音频数据通过 IPC send 传输

**选择**：Renderer 通过 ipcRenderer.send('audio-chunk', buffer) 单向发送音频块

**理由**：
- 音频块是单向流（Renderer → Main），不需要 invoke 的请求-响应模式
- send 是异步非阻塞的，不会等待 Main 处理完成
- 识别结果通过 Main → Renderer 的 webContents.send 反向推送

### D4: 录音文件使用内存缓冲 + 停止后写入

**选择**：录音过程中在 Main 进程累积 Float32Array 块，停止后一次性写入 WAV 文件

**理由**：
- 实现简单，Phase 1 优先
- 录音时长限制 30 分钟，内存占用可控（16kHz × 4bytes × 1800s ≈ 115MB）
- WAV 文件保存到 userData/recordings/ 目录

**备选**：边录边写文件 → 更健壮但实现复杂，Phase 2 可优化

### D5: 录音界面使用 Modal

**选择**：录音界面作为 Modal 覆盖在 TaskListPage 上

**理由**：
- 用户可以看到后台任务列表状态
- 更轻量，不打断工作流
- 关闭 Modal 即停止录音，交互直觉
- FeatureCards 已有占位卡片，点击即弹出 Modal

### D6: 深度分析复用现有 addDroppedFiles 流程

**选择**：用户点击"深度分析"时，将录音 WAV 文件路径通过 addDroppedFiles 提交到现有任务队列

**理由**：
- 零修改现有任务队列逻辑
- 录音文件就是标准 WAV，与用户上传的文件无异
- 自动获得说话人分离、关键词提取、AI 分析等全部功能

## Risks / Trade-offs

- **[流式模型精度低于离线模型]** → 这是预期的 trade-off。实时识别追求速度，深度分析追求精度。用户可通过"深度分析"获得更好结果。
- **[ScriptProcessorNode 已被标记为 deprecated]** → Electron 41 仍完全支持。Phase 2 可迁移到 AudioWorklet。
- **[长时间录音内存占用]** → 限制最大录音时长 30 分钟。Phase 2 可改为边录边写。
- **[流式模型需要额外下载]** → 在设置页面提供模型路径配置，与现有模型管理一致。首次使用时提示下载。
- **[麦克风权限被拒绝]** → UI 需要处理权限拒绝状态，显示友好提示。
