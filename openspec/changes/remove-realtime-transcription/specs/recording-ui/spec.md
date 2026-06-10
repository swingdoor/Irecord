## REMOVED Requirements

### Requirement: 实时转写文本显示
**Reason**: 实时识别引擎被移除，录音 Modal 不再有实时识别结果可显示。
**Migration**: 文字区域替换为"录音后处理开关面板"（参见下方 MODIFIED Requirements 与 audio-postprocessing 能力）。用户如需文本可在录音保存后通过离线转写入口获取。

## MODIFIED Requirements

### Requirement: 录音 Modal 界面
系统 SHALL 显示录音 Modal，包含录音时长、波形可视化、录音控制按钮，以及一组"录音后处理开关面板"（见 audio-postprocessing 能力），不再显示实时转写文本区。

#### Scenario: 录音进行中
- **WHEN** 录音正在进行
- **THEN** Modal 显示实时时长计时器、音频波形动画、录音状态指示器（红色闪烁点），无文字识别区

#### Scenario: 后处理开关面板可见
- **WHEN** 录音 Modal 打开
- **THEN** 显示后处理开关（压缩、降噪、静音裁剪、响度归一、保留原始 WAV），开关初始值取自全局默认设置

#### Scenario: 录音中临时调整本次后处理
- **WHEN** 用户在录音中或停止前修改面板上的开关
- **THEN** 变更仅作用于本次录音，不影响全局默认

### Requirement: 录音结果展示
系统 SHALL 在录音停止并完成后处理后，展示成品录音信息（时长、文件大小、所用后处理）与保存/导出/转写入口。

#### Scenario: 停止后展示结果
- **WHEN** 用户停止录音并完成后处理流水线
- **THEN** Modal 切换为结果展示模式，显示成品信息、保存按钮、导出 WAV、一键提交离线转写

#### Scenario: 后处理失败但原始已保存
- **WHEN** 后处理过程出错而原始 WAV 已写盘
- **THEN** 提示用户后处理失败但原始录音已保存，给出"使用原始/重试"两个选项

#### Scenario: 导出录音
- **WHEN** 用户点击导出
- **THEN** 复用现有 export-realtime-recording-wav 流程导出成品文件

### Requirement: 录音状态管理
系统 SHALL 管理录音状态机：idle → initializing → recording → paused → stopped → processing → done。

#### Scenario: 状态流转
- **WHEN** 用户执行录音操作
- **THEN** 状态按 idle → initializing → recording ↔ paused → stopped → processing → done 流转，UI 根据状态显示对应控件

#### Scenario: 后处理阶段
- **WHEN** 录音停止且至少一项后处理开关被勾选
- **THEN** 状态进入 processing，显示进度条/百分比，禁用保存与关闭

#### Scenario: 无后处理时跳过
- **WHEN** 录音停止且无任何后处理开关被勾选
- **THEN** 状态从 stopped 直接到 done，使用原始 WAV 作为成品

### Requirement: 深度分析入口
系统 SHALL 在录音结果展示界面提供"一键高质量转写"按钮，将成品录音文件提交到现有任务队列（SenseVoice/Qwen3-ASR + 说话人分离 + AI 分析）。

#### Scenario: 触发离线转写
- **WHEN** 用户点击"一键高质量转写"
- **THEN** 调用 create-proofreading-task IPC，将成品录音文件路径登记到任务队列，关闭 Modal，任务出现在任务列表
