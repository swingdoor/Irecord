## 1. 依赖安装

- [x] 1.1 安装 nodejieba 中文分词库
- [x] 1.2 验证 nodejieba 在 Node.js 子进程中可正常使用

## 2. 关键词提取模块

- [x] 2.1 新建 src/main/keywords/extract.ts，实现中文分词 + 词频统计 + 停用词过滤
- [x] 2.2 内置中文停用词表
- [x] 2.3 实现 Top N 关键词输出（默认 10 个）

## 3. 集成到识别流程

- [x] 3.1 在 asr-process.js 子进程中识别完成后调用关键词提取
- [x] 3.2 识别结果增加 keywords 字段

## 4. 类型更新

- [x] 4.1 更新 preload/index.ts 的 RecognitionResult 类型，增加 keywords 字段
- [x] 4.2 更新 appStore.ts 的 RecognitionResult 类型

## 5. 前端展示

- [x] 5.1 ResultPage 增加关键词标签列表展示
- [x] 5.2 实现点击关键词高亮对应文本片段
- [x] 5.3 导出 TXT 时在文件开头附带关键词摘要

## 6. 测试

- [x] 6.1 测试中文文本关键词提取效果
- [x] 6.2 测试短文本和空文本的边界情况
- [x] 6.3 测试关键词高亮交互
- [x] 6.4 测试导出带关键词摘要的 TXT
