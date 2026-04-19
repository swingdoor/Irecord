## Why

当前应用只能识别音频内容，无法区分不同说话人。在会议记录、访谈、多人对话等场景中，用户需要知道"谁说了什么"，以便更好地理解对话结构和归属。

## What Changes

- 集成 sherpa-onnx 的说话人分离（Speaker Diarization）功能
- 在识别结果中标注每段文本的说话人（如 Speaker 1, Speaker 2）
- 结果页支持按说话人分组显示和导出
- 用户可选择是否启用说话人分离（需要额外模型）

## Capabilities

### New Capabilities
- `speaker-diarization`: 说话人分离功能，包括模型加载、音频分段、说话人聚类、结果标注

### Modified Capabilities
- `speech-recognition`: 识别结果需要包含说话人信息（speaker 字段）
- `transcription-display`: 结果页需要支持按说话人分组显示
- `text-export`: 导出功能需要支持说话人标注格式

## Impact

**代码影响：**
- `src/main/engine/` - 新增说话人分离子进程脚本
- `src/main/utils/paths.ts` - 新增说话人模型路径管理
- `src/main/ipc.ts` - 识别流程集成说话人分离
- `src/renderer/src/stores/appStore.ts` - RecognitionResult 类型增加 speaker 字段
- `src/renderer/src/pages/ResultPage.tsx` - 支持按说话人分组显示

**依赖影响：**
- 需要下载说话人分离模型（约 10-50MB）
- sherpa-onnx-node 已支持，无需额外依赖

**用户影响：**
- 识别时间会增加（需要额外的说话人聚类计算）
- 可选功能，用户可以选择不启用
