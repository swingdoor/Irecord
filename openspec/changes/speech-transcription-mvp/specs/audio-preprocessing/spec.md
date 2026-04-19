## ADDED Requirements

### Requirement: 视频音轨提取
系统 SHALL 使用 FFmpeg 从视频文件中提取音轨，转换为 WAV 格式供后续处理。

#### Scenario: 从 MP4 视频提取音轨
- **WHEN** 用户上传一个包含音轨的 MP4 视频文件
- **THEN** 系统使用 FFmpeg 提取音轨，生成临时 WAV 文件，原视频文件不被修改

#### Scenario: 视频文件无音轨
- **WHEN** 用户上传一个不包含音轨的视频文件
- **THEN** 系统显示错误提示"该视频文件不包含音频"

### Requirement: 音频格式转换
系统 SHALL 将非 WAV 格式的音频文件转换为 16kHz 单声道 WAV 格式，作为 ASR 引擎的输入。

#### Scenario: MP3 转换为 WAV
- **WHEN** 系统接收到一个 44.1kHz 立体声 MP3 文件
- **THEN** 系统将其转换为 16kHz 单声道 WAV 文件

#### Scenario: WAV 文件已符合要求
- **WHEN** 系统接收到一个 16kHz 单声道 WAV 文件
- **THEN** 系统跳过转换步骤，直接使用该文件

### Requirement: 临时文件管理
系统 SHALL 将预处理产生的临时文件存储在系统临时目录中，并在处理完成后自动清理。

#### Scenario: 处理完成后清理临时文件
- **WHEN** 音频识别处理完成（成功或失败）
- **THEN** 系统删除所有相关的临时文件（转换后的 WAV 文件等）

#### Scenario: 应用异常退出后的临时文件
- **WHEN** 应用在处理过程中异常退出，下次启动时
- **THEN** 系统检查并清理上次遗留的临时文件
