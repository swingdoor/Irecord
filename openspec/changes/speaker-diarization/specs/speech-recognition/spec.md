## MODIFIED Requirements

### Requirement: 音频识别处理
系统 SHALL 使用 Sherpa-ONNX + Qwen3-ASR-0.6B 对预处理后的音频进行语音识别，输出文本、时间戳和说话人信息。

#### Scenario: 识别中文音频
- **WHEN** 系统接收到一个 5 分钟的中文普通话音频文件
- **THEN** 系统输出识别文本和每个段的开始/结束时间戳，识别准确率应达到基本可用水平

#### Scenario: 识别中英混合音频
- **WHEN** 系统接收到包含中英文混合内容的音频
- **THEN** 系统正确识别中文和英文内容，输出混合语言文本

#### Scenario: 识别空白音频
- **WHEN** 系统接收到一个只包含静音的音频文件
- **THEN** 系统输出空文本或提示"未检测到语音内容"

#### Scenario: 识别多人对话音频（新增）
- **WHEN** 系统接收到包含多位说话人的会议录音
- **THEN** 系统输出每段文本并标注对应的说话人 ID（Speaker 1, Speaker 2, ...）

### Requirement: 识别结果数据结构
系统 SHALL 输出结构化的识别结果，每段包含文本、时间范围和说话人信息。

#### Scenario: 输出格式包含说话人字段
- **WHEN** 识别完成
- **THEN** 系统输出 JSON 格式结果，每段包含 { text, start, end, speaker } 字段

#### Scenario: 无说话人分离时的输出
- **WHEN** 说话人分离模型不存在或用户未启用
- **THEN** 系统输出结果中 speaker 字段为 null 或不存在
