## ADDED Requirements

### Requirement: Sherpa-ONNX 引擎初始化
系统 SHALL 在应用启动时初始化 Sherpa-ONNX 引擎，加载 Qwen3-ASR-0.6B 模型。初始化 MUST 在 Worker 线程中完成，避免阻塞主进程。

#### Scenario: 成功初始化引擎
- **WHEN** 应用首次启动且模型文件存在
- **THEN** 系统在 Worker 线程中加载模型，初始化完成后通知主进程，应用进入就绪状态

#### Scenario: 模型文件缺失
- **WHEN** 应用启动时检测到模型文件不存在
- **THEN** 系统显示错误提示"模型文件缺失，请重新安装应用"，禁用识别功能

### Requirement: 音频识别处理
系统 SHALL 使用 Sherpa-ONNX + Qwen3-ASR-0.6B 对预处理后的音频进行语音识别，输出文本和词级时间戳。

#### Scenario: 识别中文音频
- **WHEN** 系统接收到一个 5 分钟的中文普通话音频文件
- **THEN** 系统输出识别文本和每个词的开始/结束时间戳，识别准确率应达到基本可用水平

#### Scenario: 识别中英混合音频
- **WHEN** 系统接收到包含中英文混合内容的音频
- **THEN** 系统正确识别中文和英文内容，输出混合语言文本

#### Scenario: 识别空白音频
- **WHEN** 系统接收到一个只包含静音的音频文件
- **THEN** 系统输出空文本或提示"未检测到语音内容"

### Requirement: 词级时间戳输出
系统 SHALL 为识别出的每个词提供精确的时间戳信息，包括开始时间和结束时间（单位：秒，精度：毫秒）。

#### Scenario: 输出词级时间戳
- **WHEN** 系统识别出文本"大家好今天讨论项目"
- **THEN** 系统输出每个词的时间戳，例如：[{"word": "大家好", "start": 0.0, "end": 0.8}, {"word": "今天", "start": 1.0, "end": 1.4}, ...]

### Requirement: 音频长度限制
系统 SHALL 限制单个音频文件的最大处理时长为 10 分钟。超过限制的文件 MUST 被拒绝并提示用户。

#### Scenario: 上传 10 分钟以内音频
- **WHEN** 用户上传一个 8 分钟的音频文件
- **THEN** 系统接受该文件并正常处理

#### Scenario: 上传超过 10 分钟音频
- **WHEN** 用户上传一个 15 分钟的音频文件
- **THEN** 系统拒绝该文件并显示提示"音频时长超过 10 分钟，请使用较短的音频文件"

### Requirement: CPU 模式运行
系统 SHALL 在 CPU 模式下运行 ASR 引擎，使用 ONNX Runtime CPU 版本。系统 MUST 自动检测可用 CPU 核心数并优化线程配置。

#### Scenario: 多核 CPU 优化
- **WHEN** 系统运行在 8 核 CPU 的机器上
- **THEN** 系统配置 ONNX Runtime 使用 8 个线程进行推理

#### Scenario: 低配置 CPU
- **WHEN** 系统运行在 4 核 CPU 的机器上
- **THEN** 系统配置 ONNX Runtime 使用 4 个线程，处理速度相应降低但功能正常
