## ADDED Requirements

### Requirement: 多源素材聚合生成
系统 SHALL 将多条选中素材的转写文本按时间排序拼接，结合模板 prompt 调用 DashScope LLM 生成 Markdown 文档。

#### Scenario: 正常生成
- **WHEN** 用户选中 2 条录音和 1 条转写记录，选择"会议纪要"模板，点击生成
- **THEN** 系统按 createdAt 排序拼接 3 条转写文本，使用会议纪要模板的 prompt 作为 system prompt，转写文本作为 user prompt，调用 LLM 返回 Markdown 内容

#### Scenario: 自由整理模板
- **WHEN** 用户选择"自由整理"模板
- **THEN** 系统在弹窗中额外展示一个文本输入框，用户输入自定义 prompt，该 prompt 作为 system prompt

#### Scenario: 生成失败
- **WHEN** LLM 调用失败（网络错误、API key 无效等）
- **THEN** 系统显示错误提示，不创建文档记录

### Requirement: 局部润色
系统 SHALL 支持在编辑器中选中文字后通过浮动工具栏调用 LLM 进行润色、改写、扩写。

#### Scenario: 触发润色
- **WHEN** 用户在编辑器中选中一段文字
- **THEN** 系统在选区上方显示浮动工具栏，包含"润色"、"改写"、"扩写"三个按钮

#### Scenario: 润色结果对比
- **WHEN** 用户点击"润色"按钮
- **THEN** 系统调用 LLM 对选中文字进行润色，在 Popover 中展示原文和润色结果，提供"采用"、"放弃"、"重新生成"三个操作

#### Scenario: 采用润色结果
- **WHEN** 用户点击"采用"
- **THEN** 系统将选中文字替换为润色结果

#### Scenario: 放弃润色结果
- **WHEN** 用户点击"放弃"
- **THEN** 系统关闭 Popover，保持原文不变

### Requirement: 文档生成 Prompt 模板
系统 SHALL 为每个预设模板定义专用的 system prompt，输出格式为 Markdown。

#### Scenario: 会议纪要模板输出
- **WHEN** 使用会议纪要模板生成
- **THEN** 输出包含：参会背景、讨论要点、决议事项、待办事项等章节

#### Scenario: 学习笔记模板输出
- **WHEN** 使用学习笔记模板生成
- **THEN** 输出包含：主题概述、核心知识点、要点总结等章节

#### Scenario: 周报总结模板输出
- **WHEN** 使用周报总结模板生成
- **THEN** 输出包含：本周工作、重点进展、下周计划等章节

#### Scenario: 访谈整理模板输出
- **WHEN** 使用访谈整理模板生成
- **THEN** 输出包含：访谈背景、按话题分组的 Q&A 内容、关键观点等章节
