## ADDED Requirements

### Requirement: 导出 Markdown
系统 SHALL 支持将文档内容导出为 .md 文件。

#### Scenario: 导出 Markdown
- **WHEN** 用户在文档编辑页点击"导出 Markdown"
- **THEN** 系统弹出保存对话框，将编辑器内容转为 Markdown 格式写入用户选择的路径

### Requirement: 导出 TXT
系统 SHALL 支持将文档内容导出为纯文本 .txt 文件。

#### Scenario: 导出 TXT
- **WHEN** 用户在文档编辑页点击"导出 TXT"
- **THEN** 系统弹出保存对话框，将编辑器内容去除格式标记后写入纯文本文件

### Requirement: 导出 PDF
系统 SHALL 支持将文档内容导出为 .pdf 文件。

#### Scenario: 导出 PDF
- **WHEN** 用户在文档编辑页点击"导出 PDF"
- **THEN** 系统使用 Electron 的 printToPDF 能力，将文档内容渲染为 PDF 并保存到用户选择的路径

### Requirement: 导出文件命名
系统 SHALL 使用文档标题作为默认导出文件名。

#### Scenario: 默认文件名
- **WHEN** 用户触发导出
- **THEN** 保存对话框的默认文件名为文档标题（去除特殊字符）加对应扩展名
