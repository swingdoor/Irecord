## REMOVED Requirements

### Requirement: 流式识别引擎初始化
**Reason**: 本地实时转写质量不达预期，且项目已存在质量更高的离线转写通路（任务队列 SenseVoice/Qwen3-ASR + 说话人分离）。移除流式识别引擎与对应模型可瘦身打包并简化架构。
**Migration**: 用户可在录音停止后通过现有"精准校对/一键转写"入口将录音 WAV 提交到离线任务队列，获得更高质量的全文转写。

### Requirement: 实时音频处理
**Reason**: 流式识别引擎被移除后，对应的实时音频解码循环不再需要。
**Migration**: 录音音频块改为只写入 WAV 文件（参见 audio-capture 中的录音文件保存），不再喂入 ASR 流。

### Requirement: 实时结果回传
**Reason**: 不再有实时识别结果，相应的 IPC 通道（realtime-result）一并移除。
**Migration**: Renderer 不再监听 onRealtimeResult；录音过程中无文本反馈，停止后通过离线转写获取结果。

### Requirement: 端点检测与分段
**Reason**: 端点检测属于流式识别能力的内部行为，引擎移除后不再适用。
**Migration**: 录音内分段在离线转写阶段由对应 ASR 模型完成。

### Requirement: 录音结束处理
**Reason**: 录音结束处理由独立的纯录音器（AudioRecorder）承担，不再涉及识别结果合并。
**Migration**: 参见 audio-capture 的修改：停止后返回原始 WAV 文件路径与时长，不返回 segments。

### Requirement: 识别结果格式
**Reason**: 录音停止时不再产出识别结果。
**Migration**: 离线转写任务沿用既有 segments/text 输出格式，与文件转写一致。
