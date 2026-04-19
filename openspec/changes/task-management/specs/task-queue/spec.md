## ADDED Requirements

### Requirement: 任务队列管理
系统 SHALL 维护一个任务队列，支持添加多个文件，按顺序串行处理。

#### Scenario: 添加多个文件
- **WHEN** 用户选择多个音频文件
- **THEN** 系统为每个文件创建一个 pending 任务，加入队列

#### Scenario: 自动开始处理
- **WHEN** 队列中有 pending 任务且当前没有 processing 任务
- **THEN** 系统自动取最早的 pending 任务开始处理

#### Scenario: 处理完成后继续
- **WHEN** 当前任务处理完成
- **THEN** 系统自动检查队列，如有 pending 任务则开始处理下一个

### Requirement: 任务状态管理
系统 SHALL 维护每个任务的状态：pending、processing、completed、failed。

#### Scenario: 任务失败
- **WHEN** 识别过程中发生错误
- **THEN** 系统将任务状态更新为 failed，记录错误信息，继续处理队列中的下一个任务

### Requirement: 删除任务
系统 SHALL 支持删除已完成或失败的任务。

#### Scenario: 删除历史任务
- **WHEN** 用户删除一个已完成的任务
- **THEN** 系统从数据库中删除该任务及其识别结果
