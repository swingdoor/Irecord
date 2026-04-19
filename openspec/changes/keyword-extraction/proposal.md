## Why

当前应用可以完成语音转写和说话人分离，但用户仍然需要手动通读全文才能找到重点内容。关键词提取可以快速总结音频主题，帮助用户定位核心内容、提升检索效率。

## What Changes

- 在转写结果基础上新增关键词提取能力
- 支持中文文本自动分词和关键词排序
- 结果页展示关键词列表
- 关键词支持点击高亮和快速定位到对应文本片段
- 导出时可附带关键词摘要

## Capabilities

### New Capabilities
- `keyword-extraction`: 对转写文本进行分词、关键词打分和结果输出

### Modified Capabilities
- `transcription-display`: 结果页增加关键词展示和点击定位能力
- `text-export`: 导出时可选择包含关键词摘要

## Impact

**代码影响：**
- `src/main/`：新增关键词提取逻辑（可在子进程脚本或主进程中实现）
- `src/renderer/src/pages/ResultPage.tsx`：新增关键词 UI 和交互
- `src/preload/index.ts`、`src/renderer/src/stores/appStore.ts`：识别结果类型增加关键词字段
- `src/main/ipc.ts`：导出逻辑增加关键词摘要支持

**依赖影响：**
- 需要新增中文分词/关键词提取依赖（如 nodejieba）

**用户影响：**
- 结果页更易于阅读和检索
- 导出内容更完整
