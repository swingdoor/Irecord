## MODIFIED Requirements

### Requirement: 录音页三阶段工作流
系统 SHALL 在 RecordingPage 实现三阶段工作流：录音中 → 停止后（仅转写开关）→ 完成，移除后处理相关的配置阶段与处理中阶段。

#### Scenario: 录音中阶段
- **WHEN** 用户开始或暂停录音
- **THEN** 页面仅显示实时波形、计时器、暂停/继续/停止按钮，不显示任何后处理或转写文字区

#### Scenario: 停止进入配置阶段
- **WHEN** 用户点击停止
- **THEN** 页面显示原始 WAV 试听播放器、唯一的"创建语音转写"勾选项、放弃/保存按钮，不显示后处理开关

#### Scenario: 保存并可选触发转写
- **WHEN** 用户点击保存
- **THEN** 系统创建纯音频录音记录；若勾选了"创建语音转写"则同时创建 `source='recording'` 的转写任务并入队

#### Scenario: 完成阶段
- **WHEN** 录音记录保存完成
- **THEN** 页面显示"录音已保存"；若创建了转写任务则显示"转写任务已创建"及进入查看的入口，不显示成品/原始对比

### Requirement: 录音列表操作按转写状态显隐
系统 SHALL 在录音列表的操作菜单中根据每条录音的转写状态显示对应操作，移除导出 TXT。

#### Scenario: 未转写显示语音转写
- **WHEN** 录音的派生转写状态为 `none` 或 `failed`
- **THEN** 操作菜单显示「语音转写」，点击为该录音创建转写任务

#### Scenario: 已转写显示转写详情
- **WHEN** 录音的派生转写状态为 `completed`
- **THEN** 操作菜单显示「转写详情」，点击跳转至该任务的 TaskDetailPage

#### Scenario: 转写中禁用入口
- **WHEN** 录音的派生转写状态为 pending 或 processing
- **THEN** 不显示「语音转写」创建入口（避免重复创建），可显示"转写中"提示

#### Scenario: 移除导出 TXT
- **WHEN** 渲染录音列表操作菜单
- **THEN** 不再提供「导出 TXT」（录音本身无转写文字；转写后的文本由 TaskDetailPage 导出）

#### Scenario: 保留基础操作
- **WHEN** 渲染录音列表操作菜单
- **THEN** 保留「下载 WAV」与「删除」

### Requirement: 录音详情页按转写状态分流
系统 SHALL 在录音详情按转写状态分流：已转写跳转复用 TaskDetailPage，未转写展示纯音频与转写入口。

#### Scenario: 已转写跳转复用详情
- **WHEN** 用户打开转写状态为 `completed` 的录音详情
- **THEN** 系统直接跳转 TaskDetailPage，复用统一的转写面板与 AI 分析面板

#### Scenario: 未转写展示纯音频
- **WHEN** 用户打开转写状态为 `none`/`failed`/转写中 的录音详情
- **THEN** 页面展示音频播放器与「语音转写」入口（转写中则显示进行中提示），不再自渲染转写文字或 taskId 错配的 AI 面板

### Requirement: 文件上传列表来源过滤
系统 SHALL 使「文件上传」列表仅显示 `source='upload'` 的任务，录音来源的转写任务不混入。

#### Scenario: 过滤录音来源任务
- **WHEN** 渲染「文件上传」Tab 的任务表
- **THEN** 仅展示 `source` 为 `'upload'`（含旧数据默认值）的任务，`source='recording'` 的任务不出现于此列表
