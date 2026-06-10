## MODIFIED Requirements

### Requirement: 录音文件保存
系统 SHALL 由独立的纯录音器（AudioRecorder）将完整音频流式写入 16kHz 单声道 WAV 文件至 userData/recordings/ 目录，不依赖任何语音识别引擎。

#### Scenario: 保存成功
- **WHEN** 录音停止
- **THEN** 在 userData/recordings/ 目录生成 WAV 文件，文件名包含时间戳，停止接口返回 { filePath, duration, fileSize }

#### Scenario: 录音中崩溃保护
- **WHEN** 录音进行中音频块持续到达
- **THEN** 录音器立即将每个音频块追加写入 WAV 文件并维护采样数计数，停止时补全 WAV 头

#### Scenario: 录音器与识别解耦
- **WHEN** 音频块从 Renderer 进程传入 Main 进程
- **THEN** 仅交给 AudioRecorder 处理，不再传入任何流式识别器

### Requirement: 录音时长限制
系统 SHALL 限制单次录音最长 120 分钟，达到上限时自动停止并保存。

#### Scenario: 达到时长上限
- **WHEN** 录音时长达到 120 分钟
- **THEN** AudioRecorder 自动触发停止流程，补全 WAV 头，提示用户已达上限

#### Scenario: 时长上限位置
- **WHEN** 系统初始化录音器
- **THEN** 时长上限由 AudioRecorder 自身维护，不依赖任何识别引擎
