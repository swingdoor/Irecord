## ADDED Requirements

### Requirement: 录音入口
系统 SHALL 在 TaskListPage 的 FeatureCards 中激活"实时录音"卡片，点击后弹出录音 Modal。

#### Scenario: 点击开始录音
- **WHEN** 用户点击"实时录音"卡片按钮
- **THEN** 弹出录音 Modal，请求麦克风权限后开始录音

### Requirement: 录音 Modal 界面
系统 SHALL 显示录音 Modal，包含录音时长、波形可视化、实时转写文本区域和控制按钮。

#### Scenario: 录音进行中
- **WHEN** 录音正在进行
- **THEN** Modal 显示实时时长计时器、音频波形动画、录音状态指示器（红色闪烁点）

### Requirement: 实时转写文本显示
系统 SHALL 在录音 Modal 中实时显示识别文本，已完成句子固定显示带时间戳，当前识别中的句子实时更新。

#### Scenario: 显示已完成句子
- **WHEN** 收到 isFinal: true 的识别结果
- **THEN** 将句子固定显示在文本区域，带时间戳前缀，自动滚动到底部

#### Scenario: 显示正在识别的句子
- **WHEN** 收到 isFinal: false 的识别结果
- **THEN** 在文本区域底部实时更新当前识别文本，显示闪烁光标

### Requirement: 波形可视化
系统 SHALL 在录音过程中显示实时音频波形动画。

#### Scenario: 波形实时更新
- **WHEN** 录音进行中
- **THEN** 使用 Canvas 绘制实时音频波形，反映当前音量变化

### Requirement: 录音结果展示
系统 SHALL 在录音停止后展示完整识别结果，支持复制和导出。

#### Scenario: 停止后展示结果
- **WHEN** 用户停止录音
- **THEN** Modal 切换为结果展示模式，显示完整转写文本和分段信息

#### Scenario: 复制结果
- **WHEN** 用户点击复制按钮
- **THEN** 将完整转写文本复制到剪贴板

#### Scenario: 导出结果
- **WHEN** 用户点击导出按钮
- **THEN** 调用现有导出逻辑，保存为 TXT 文件

### Requirement: 深度分析入口
系统 SHALL 在录音结果展示界面提供"深度分析"按钮，将录音文件提交到现有任务队列。

#### Scenario: 触发深度分析
- **WHEN** 用户点击"深度分析"按钮
- **THEN** 将录音 WAV 文件通过 addDroppedFiles 提交到任务队列，关闭 Modal，任务出现在任务列表中

### Requirement: 录音状态管理
系统 SHALL 管理录音状态机：idle → initializing → recording → paused → stopped。

#### Scenario: 状态流转
- **WHEN** 用户执行录音操作
- **THEN** 状态按 idle → initializing → recording ↔ paused → stopped 流转，UI 根据状态显示对应控件
