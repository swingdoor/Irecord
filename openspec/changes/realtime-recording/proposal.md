## Why

IRecord 目前只支持文件上传转写，用户必须先录音再导入。添加实时录音识别功能，让用户可以直接在应用内录音并实时看到转写结果，覆盖会议记录、采访、课堂笔记等即时场景。sherpa-onnx-node 已原生支持 OnlineRecognizer 流式识别 API，技术可行性已验证。

## What Changes

- 新增麦克风录音功能，使用 Web Audio API 捕获 16kHz 单声道音频
- 新增流式语音识别，使用 sherpa-onnx OnlineRecognizer + streaming-zipformer-zh-int8 模型实现边录边识别
- 新增录音 Modal 界面，包含实时波形可视化和转写文本实时显示
- 录音完成后直接展示实时识别结果，支持复制和导出
- 用户可手动触发"深度分析"，将录音文件提交到现有任务队列（SenseVoice/Qwen3-ASR 重新识别 + 说话人分离 + AI 分析）
- 录音文件保存为 WAV 到 userData/recordings/ 目录
- 流式识别器独立于文件转写队列运行，两者互不干扰

## Capabilities

### New Capabilities
- `audio-capture`: 麦克风音频捕获、录音控制（开始/暂停/停止）、WAV 文件保存
- `realtime-recognition`: 流式语音识别引擎封装、实时结果回传、端点检测与分段
- `recording-ui`: 录音 Modal 界面、波形可视化、实时转写文本显示、录音状态管理、结果展示与导出、手动触发深度分析入口

### Modified Capabilities

## Impact

- **新增依赖**：需要下载 streaming-zipformer-zh-int8 流式模型（~100MB，与现有离线模型分开）
- **IPC 层**：新增 start-recording / audio-chunk / stop-recording / realtime-result 等通道
- **Preload**：暴露录音相关 API 到 Renderer 进程
- **打包配置**：流式模型不打包，与现有模型一致的资源校验策略
- **权限**：需要用户授权麦克风访问
- **任务队列**：录音文件可手动提交到现有队列，复用已有的文件转写流程，无需修改队列逻辑
