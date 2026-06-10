## MODIFIED Requirements

### Requirement: 异步执行与进度反馈
系统 SHALL 在用户于配置阶段主动触发后异步执行后处理流水线，并通过 IPC 向 Renderer 推送进度，期间不阻塞 UI。后处理不再于 stop-recording 时自动触发。

#### Scenario: 用户主动触发处理
- **WHEN** 用户在停止后的配置阶段勾选后处理项并点击保存
- **THEN** 通过独立的 process-recording IPC 触发处理，stop-recording 本身只负责 finalize 原始 WAV

#### Scenario: 推送进度
- **WHEN** ffmpeg 处理进行中
- **THEN** Main 进程周期性推送 { progress: 0..1 } 到 Renderer，并附带当前步骤描述

#### Scenario: 处理失败回退
- **WHEN** ffmpeg 退出码非 0 或异常终止
- **THEN** 系统保留原始 WAV，向 Renderer 推送错误事件，完成阶段使用原始 WAV 作为可保存文件

### Requirement: 原始文件保留策略
系统 SHALL 默认保留原始 WAV，并将后处理成品作为独立的平行文件产出，不再以"删除原始"为默认行为。

#### Scenario: 默认保留原始
- **WHEN** 用户未改动"保留原始"开关并执行后处理
- **THEN** 原始 WAV 与成品文件同时保留，记录的 originalFilePath 指向原始，filePath 指向成品

#### Scenario: 用户主动取消保留
- **WHEN** 用户取消勾选"保留原始 WAV"且后处理成功
- **THEN** 删除原始 WAV，filePath 指向成品，originalFilePath 留空

#### Scenario: 成品作为平行产物
- **WHEN** 后处理成功
- **THEN** 成品是新文件（不同路径/扩展名），原始 WAV 不被后处理覆盖或修改
