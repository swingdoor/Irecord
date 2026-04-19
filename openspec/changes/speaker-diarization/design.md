## Context

MVP（Change 1）已实现基础语音识别，使用 VAD 分段 + Qwen3-ASR 逐段识别的架构。识别在独立 Node.js 子进程中运行（避免 Electron external buffer 限制），通过 stdin/stdout JSON 通信。

sherpa-onnx-node 已提供 `OfflineSpeakerDiarization` API，使用 pyannote segmentation + 3D-Speaker/wespeaker embedding 模型。

## Goals / Non-Goals

**Goals:**
- 在现有 VAD + ASR 流程中集成说话人分离
- 每段识别结果标注说话人 ID
- 前端按说话人颜色区分显示
- 导出时包含说话人标注

**Non-Goals:**
- 说话人识别（识别"这是张三"，只做分离"这是 Speaker 1"）
- 实时说话人分离
- 说话人数量手动指定（自动聚类）

## Decisions

### 1. 使用 sherpa-onnx 内置的 OfflineSpeakerDiarization

**决策**：直接使用 sherpa-onnx-node 的 `OfflineSpeakerDiarization` API。

**理由**：
- 已内置 pyannote segmentation + speaker embedding + 聚类
- 无需额外依赖
- 与现有子进程架构兼容

**备选方案**：
- ❌ 手动实现 VAD + embedding + 聚类：工作量大，效果不一定好

### 2. 新建独立子进程脚本

**决策**：新建 `asr-diarize-process.js`，在同一个子进程中完成说话人分离 + ASR。

**理由**：
- 说话人分离需要读取整个音频，ASR 也需要读取音频
- 在同一进程中可以共享音频数据，避免重复读取
- 保持与现有 `asr-process.js` / `asr-vad-process.js` 一致的通信协议

### 3. 说话人分离结果与 ASR 结果合并

**决策**：先做说话人分离得到每段的说话人 ID 和时间范围，再对每段做 ASR 识别。

**流程**：
1. 读取音频
2. 运行 OfflineSpeakerDiarization → 得到 segments（每段有 start, end, speaker）
3. 对每段音频切片运行 ASR → 得到文本
4. 合并：每段有 start, end, speaker, text

### 4. 前端说话人颜色方案

**决策**：预定义 8 种颜色，按 speaker ID 循环分配。

## Risks / Trade-offs

### 1. 说话人分离模型需要额外下载
**风险**：用户需要下载 segmentation 和 embedding 两个模型。
**缓解**：设为可选功能，无模型时回退到现有 VAD 方案。

### 2. 处理时间增加
**风险**：说话人分离需要额外计算时间。
**缓解**：用户可选择是否启用。

### 3. 说话人数量不准确
**风险**：自动聚类可能误判说话人数量。
**缓解**：可通过调整聚类阈值优化，后续可增加手动指定说话人数量的选项。
