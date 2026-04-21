## ADDED Requirements

### Requirement: 流式识别引擎初始化
系统 SHALL 使用 sherpa-onnx OnlineRecognizer 和 streaming-zipformer-zh-int8 模型创建流式识别器实例，独立于文件转写队列。

#### Scenario: 初始化成功
- **WHEN** 用户开始录音且流式模型存在
- **THEN** 创建 OnlineRecognizer 实例和 OnlineStream，准备接收音频

#### Scenario: 模型不存在
- **WHEN** 用户开始录音但流式模型未下载
- **THEN** 提示用户需要下载流式模型，并在设置中提供模型路径配置

### Requirement: 实时音频处理
系统 SHALL 将接收到的音频块实时喂入 OnlineStream 并触发解码。

#### Scenario: 处理音频块
- **WHEN** Main 进程收到音频块
- **THEN** 调用 stream.acceptWaveform 喂入音频，循环调用 isReady + decode 直到无法继续解码

### Requirement: 实时结果回传
系统 SHALL 在每次解码后将当前识别结果推送到 Renderer 进程。

#### Scenario: 推送中间结果
- **WHEN** 解码完成且有新的识别文本
- **THEN** 将 { text, isFinal: false, startTime } 推送到 Renderer

### Requirement: 端点检测与分段
系统 SHALL 使用 isEndpoint 检测语音结束，自动分段并重置流。

#### Scenario: 检测到句子结束
- **WHEN** isEndpoint 返回 true
- **THEN** 获取最终结果，推送 { text, isFinal: true, startTime }，调用 reset 重置流开始下一句

### Requirement: 录音结束处理
系统 SHALL 在录音停止时处理剩余音频并返回完整识别结果。

#### Scenario: 正常停止
- **WHEN** 用户停止录音
- **THEN** 调用 inputFinished，获取最终结果，合并所有已完成片段，返回完整转写文本和分段信息

### Requirement: 识别结果格式
系统 SHALL 以与文件转写一致的格式输出识别结果，包含文本、分段（text + start + end）。

#### Scenario: 结果格式一致
- **WHEN** 录音停止并获得完整结果
- **THEN** 结果包含 text（完整文本）和 segments 数组（每段含 text、start、end 字段）
