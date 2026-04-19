## ADDED Requirements

### Requirement: 任务列表页
系统 SHALL 提供任务列表页作为应用主页，展示所有任务。

#### Scenario: 空状态
- **WHEN** 没有任何任务
- **THEN** 显示空状态提示和添加文件按钮

#### Scenario: 展示进行中的任务
- **WHEN** 有 processing 状态的任务
- **THEN** 显示文件名、处理状态、已用时间（实时更新）

#### Scenario: 展示待处理任务
- **WHEN** 有 pending 状态的任务
- **THEN** 显示文件名和"排队中"状态

#### Scenario: 展示已完成任务
- **WHEN** 有 completed 状态的任务
- **THEN** 显示文件名、完成时间、字数摘要，点击可进入详情页

#### Scenario: 展示失败任务
- **WHEN** 有 failed 状态的任务
- **THEN** 显示文件名和错误信息

### Requirement: 添加文件
系统 SHALL 在任务列表页提供添加文件入口。

#### Scenario: 添加文件
- **WHEN** 用户点击添加按钮或拖拽文件到列表页
- **THEN** 打开文件选择对话框（支持多选），创建任务并加入队列

## MODIFIED Requirements

### Requirement: 结果详情页
原 ResultPage 改造为 TaskDetailPage，从数据库读取数据。

#### Scenario: 查看历史结果
- **WHEN** 用户在任务列表中点击已完成的任务
- **THEN** 进入详情页，从数据库加载识别结果，展示文本、说话人、关键词等
- **AND** 保留复制、导出、时间戳切换、关键词高亮等功能

#### Scenario: 返回列表
- **WHEN** 用户在详情页点击返回
- **THEN** 返回任务列表页
