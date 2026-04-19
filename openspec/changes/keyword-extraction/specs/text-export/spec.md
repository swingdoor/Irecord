## MODIFIED Requirements

### Requirement: 导出文本格式
系统 SHALL 在导出 TXT 文件时，可选择在文件开头附带关键词摘要。

#### Scenario: 导出带关键词摘要
- **WHEN** 用户导出识别结果且结果包含关键词
- **THEN** 导出的 TXT 文件开头包含关键词列表，格式如：关键词：项目、方案、进展、时间节点
