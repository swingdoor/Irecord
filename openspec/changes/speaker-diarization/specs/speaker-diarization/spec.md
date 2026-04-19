## ADDED Requirements

### Requirement: 说话人分离模型加载
系统 SHALL 在子进程中加载 pyannote segmentation 模型和 3D-Speaker embedding 模型，用于说话人分离。

#### Scenario: 模型存在时加载成功
- **WHEN** 说话人分离模型文件存在于 resources/models 目录
- **THEN** 系统成功加载模型并进入就绪状态

#### Scenario: 模型不存在时回退
- **WHEN** 说话人分离模型文件不存在
- **THEN** 系统回退到无说话人分离的 VAD 分段识别模式

### Requirement: 音频说话人分离
系统 SHALL 对输入音频执行说话人分离，自动检测说话人数量并为每段语音标注说话人 ID。

#### Scenario: 多人对话音频
- **WHEN** 系统处理一段包含 3 位说话人的会议录音
- **THEN** 系统输出每段语音的说话人 ID（Speaker 1, Speaker 2, Speaker 3）和对应的时间范围

#### Scenario: 单人音频
- **WHEN** 系统处理一段只有 1 位说话人的音频
- **THEN** 系统输出所有段落标注为同一说话人（Speaker 1）

### Requirement: 说话人分离结果与 ASR 结果合并
系统 SHALL 将说话人分离的时间段与 ASR 识别的文本合并，输出每段包含说话人 ID、时间范围和文本内容。

#### Scenario: 合并输出格式
- **WHEN** 说话人分离和 ASR 识别均完成
- **THEN** 系统输出结构化结果，每段包含 speaker、start、end、text 四个字段

### Requirement: 说话人统计信息
系统 SHALL 统计每位说话人的发言次数和总时长。

#### Scenario: 输出说话人统计
- **WHEN** 识别完成
- **THEN** 系统输出每位说话人的发言段数和总时长（秒）
