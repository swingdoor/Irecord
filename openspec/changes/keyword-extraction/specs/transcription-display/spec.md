## MODIFIED Requirements

### Requirement: 转写文本展示
系统 SHALL 在识别完成后展示转写文本，并在结果页显示关键词列表。点击关键词 SHALL 高亮对应文本片段。

#### Scenario: 展示关键词列表
- **WHEN** 识别结果包含关键词字段
- **THEN** 结果页在摘要区域或文本上方显示关键词标签列表

#### Scenario: 点击关键词高亮
- **WHEN** 用户点击一个关键词标签
- **THEN** 结果页中对应的文本片段被高亮显示
