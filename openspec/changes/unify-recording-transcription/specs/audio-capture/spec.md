## MODIFIED Requirements

### Requirement: 录音停止产出纯音频记录
系统 SHALL 在录音停止后仅 finalize 原始 WAV 并落地为纯音频记录，不再产出后处理成品或维护原始/成品双文件模型。

#### Scenario: 停止仅 finalize 原始 WAV
- **WHEN** 用户停止录音
- **THEN** 系统 finalize 原始 WAV，返回其路径、时长、文件大小，不触发任何后处理

#### Scenario: 落地为纯音频记录
- **WHEN** 用户在停止后保存录音
- **THEN** 系统创建仅含 `id/title/filePath/fileId/fileSize/duration/createdAt` 的录音记录，不写入 text/segments/wordCount/originalFilePath/postProcessing

#### Scenario: 录音文件即转写源
- **WHEN** 为录音创建转写任务
- **THEN** 转写直接使用录音 `filePath`，不存在"原始 vs 成品"的转写源选择
