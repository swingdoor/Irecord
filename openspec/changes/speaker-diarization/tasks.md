## 1. 模型准备

- [x] 1.1 确认说话人分离所需模型（pyannote segmentation + 3D-Speaker embedding），编写下载说明
- [x] 1.2 在 paths.ts 中新增说话人分离模型路径管理（getDiarizationModelPath, checkDiarizationModelsExist）

## 2. 说话人分离子进程脚本

- [x] 2.1 新建 asr-diarize-process.js，实现说话人分离 + ASR 识别的完整流程
- [x] 2.2 实现 OfflineSpeakerDiarization 初始化和调用
- [x] 2.3 实现说话人分离结果与 ASR 识别结果的合并（每段包含 speaker, start, end, text）
- [x] 2.4 实现说话人统计信息输出（每位说话人的发言段数和总时长）

## 3. 主进程集成

- [x] 3.1 更新 ipc.ts，当说话人分离模型存在时优先使用 asr-diarize-process.js
- [x] 3.2 更新识别结果数据结构，segments 中增加 speaker 字段

## 4. 前端类型和状态更新

- [x] 4.1 更新 preload/index.ts 的 RecognitionResult 类型，segments 增加 speaker 字段
- [x] 4.2 更新 appStore.ts 的 RecognitionResult 类型
- [x] 4.3 更新导出 IPC 参数类型

## 5. 前端结果页改造

- [x] 5.1 ResultPage 支持按说话人颜色标记显示（预定义 8 种颜色）
- [x] 5.2 ResultPage 摘要区域显示说话人数量和统计信息
- [x] 5.3 导出功能支持说话人标注格式

## 6. 测试

- [x] 6.1 测试多人对话音频的说话人分离效果
- [x] 6.2 测试单人音频的回退行为
- [x] 6.3 测试无说话人模型时的回退到 VAD 模式
- [x] 6.4 测试导出带说话人标注的 TXT 文件
