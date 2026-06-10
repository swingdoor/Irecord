## REMOVED Requirements

### Requirement: 录音 Modal 界面
**Reason**: 后处理 UI 被错误地实现在未被引用的死代码 RecordingModal.tsx 上，实际使用的是 RecordingPage。RecordingModal 整体删除。
**Migration**: 后处理开关面板、进度显示、结果展示全部迁移到 RecordingPage 的四阶段工作流（参见 recording-workflow 能力）。

## MODIFIED Requirements

### Requirement: 录音结果展示
系统 SHALL 在 RecordingPage 的完成阶段展示成品与原始录音的对比试听，以及保存、导出、转写状态入口，取代原 Modal 的结果展示。

#### Scenario: 完成阶段展示
- **WHEN** 录音停止并完成后处理（或跳过处理）
- **THEN** RecordingPage 进入完成阶段，显示成品 AudioPlayer，保留原始时并列显示原始 AudioPlayer

#### Scenario: 保存录音
- **WHEN** 用户在完成阶段确认保存
- **THEN** 调用 saveRealtimeRecording 写入记录，filePath 指向成品（或原始），refreshRealtimeRecordings 刷新列表

#### Scenario: 转写状态提示
- **WHEN** 用户在配置阶段勾选了创建转写任务
- **THEN** 完成阶段显示"转写任务已创建"提示及前往任务列表的入口

### Requirement: 后处理开关面板
系统 SHALL 在 RecordingPage 的停止后配置阶段显示后处理开关面板（压缩、降噪、静音裁剪、响度归一、保留原始 WAV），初始值取自全局默认设置，本次可临时覆盖。

#### Scenario: 配置阶段显示开关
- **WHEN** 录音停止进入配置阶段
- **THEN** 显示五个后处理开关，初始值来自 settings.recordingPostProcessing

#### Scenario: 临时覆盖不持久化
- **WHEN** 用户在配置阶段修改开关
- **THEN** 变更仅作用于本次录音，不写回全局设置
