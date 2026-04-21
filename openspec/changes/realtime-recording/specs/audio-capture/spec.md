## ADDED Requirements

### Requirement: 请求麦克风权限
系统 SHALL 在用户首次点击录音时请求麦克风访问权限。

#### Scenario: 权限授予成功
- **WHEN** 用户点击开始录音且授予麦克风权限
- **THEN** 系统开始捕获 16kHz 单声道音频流

#### Scenario: 权限被拒绝
- **WHEN** 用户拒绝麦克风权限
- **THEN** 系统显示友好提示，说明需要麦克风权限才能使用录音功能

### Requirement: 音频捕获参数
系统 SHALL 以 16kHz 采样率、单声道、Float32 格式捕获麦克风音频，启用回声消除和噪声抑制。

#### Scenario: 音频格式正确
- **WHEN** 麦克风开始捕获
- **THEN** 输出的音频块为 Float32Array，采样率 16000Hz，单声道

### Requirement: 音频块传输
系统 SHALL 每 4096 samples（约 256ms）将音频块从 Renderer 进程发送到 Main 进程。

#### Scenario: 持续传输
- **WHEN** 录音进行中
- **THEN** 每 256ms 发送一个音频块到 Main 进程，不等待响应

### Requirement: 录音控制
系统 SHALL 支持开始、暂停、继续、停止录音操作。

#### Scenario: 暂停录音
- **WHEN** 用户点击暂停
- **THEN** 停止捕获音频，停止发送音频块，保留已有数据

#### Scenario: 继续录音
- **WHEN** 用户在暂停状态点击继续
- **THEN** 恢复音频捕获和发送

#### Scenario: 停止录音
- **WHEN** 用户点击停止
- **THEN** 停止音频捕获，释放麦克风资源，通知 Main 进程录音结束

### Requirement: 录音文件保存
系统 SHALL 在录音停止后将完整音频保存为 16kHz mono WAV 文件到 userData/recordings/ 目录。

#### Scenario: 保存成功
- **WHEN** 录音停止
- **THEN** 在 userData/recordings/ 目录生成 WAV 文件，文件名包含时间戳

### Requirement: 录音时长限制
系统 SHALL 限制单次录音最长 30 分钟。

#### Scenario: 达到时长上限
- **WHEN** 录音时长达到 30 分钟
- **THEN** 自动停止录音，保存文件，提示用户已达上限
