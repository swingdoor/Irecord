## ADDED Requirements

### Requirement: 录音页四阶段工作流
系统 SHALL 在 RecordingPage 中实现四阶段工作流：录音中 → 停止后配置 → 处理中 → 完成，各阶段以 UI 状态驱动，区域渐进展开。

#### Scenario: 录音中阶段
- **WHEN** 用户开始录音
- **THEN** 页面仅显示实时波形、计时器、暂停/停止按钮，不显示后处理选项或文字区

#### Scenario: 停止进入配置阶段
- **WHEN** 用户点击停止
- **THEN** 页面进入配置阶段，显示原始录音试听播放器、后处理开关面板、"同时创建转写"勾选、保存操作按钮

#### Scenario: 配置后触发处理
- **WHEN** 用户在配置阶段勾选了至少一项后处理并点击保存
- **THEN** 页面进入处理中阶段，显示进度条与当前步骤文案

#### Scenario: 无后处理直接完成
- **WHEN** 用户未勾选任何后处理项并点击保存
- **THEN** 跳过处理阶段，直接进入完成阶段，成品即原始 WAV

#### Scenario: 处理完成进入对比阶段
- **WHEN** 后处理流水线成功完成
- **THEN** 页面进入完成阶段，显示成品试听播放器，若保留原始则同时显示原始试听播放器

### Requirement: 原始与成品 A/B 对比试听
系统 SHALL 在完成阶段提供成品与原始录音各自独立的播放器，供用户对比后处理效果。

#### Scenario: 成品试听
- **WHEN** 完成阶段渲染
- **THEN** 成品文件通过 AudioPlayer 组件提供波形、播放、倍速、音量控制

#### Scenario: 原始对比试听
- **WHEN** 用户勾选了保留原始且后处理已执行
- **THEN** 原始 WAV 通过独立的 AudioPlayer 实例提供试听，与成品并列展示

#### Scenario: 体积对比提示
- **WHEN** 成品为压缩格式且原始保留
- **THEN** 显示成品相对原始的体积变化（如 "180KB ↓86%"）

### Requirement: 转写任务使用原始音频契约
系统 SHALL 在创建转写任务时优先使用原始 WAV 文件，仅在原始不可用时回退到成品。

#### Scenario: 默认用原始转写
- **WHEN** 用户在配置阶段勾选"同时创建转写"且保留了原始 WAV
- **THEN** create-proofreading-task 使用 originalFilePath 作为转写源

#### Scenario: 原始不存在时回退
- **WHEN** 用户取消保留原始且创建转写任务
- **THEN** 转写回退使用成品 filePath，并提示用户压缩音频可能影响识别精度

### Requirement: 前端录音状态机
系统 SHALL 维护 RecordingPage 的 UI 状态机：idle → recording ⇄ paused → stopped → (processing) → done。

#### Scenario: 暂停继续
- **WHEN** 录音中点击暂停再继续
- **THEN** 状态在 recording 与 paused 间切换，计时暂停与恢复

#### Scenario: 处理失败降级
- **WHEN** 后处理失败
- **THEN** 状态进入 done，提示处理失败，成品区显示降级信息，保存时使用原始 WAV
