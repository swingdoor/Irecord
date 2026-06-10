## Context

**背景**：实时转写（`realtime-recognizer.ts` / `qwen3-realtime-recognizer.ts`）使用 streaming-zipformer 或 Qwen3 模拟流式识别，质量不达预期，边录边识别的草稿价值有限。同时项目已具备离线高质量转写通路（任务队列 SenseVoice/Qwen3-ASR + 说话人分离 + AI 分析），使得实时识别本质上沦为冗余的低质量预览。

**现状痛点**：
- WAV 写盘逻辑嵌在 recognizer 内部（`feedAudio` 写入 + `finalize` 补头），录音与识别**强耦合**，无法独立复用录音器。
- streaming-zipformer 模型打包 ~100MB，但使用率与价值回报不成正比。
- 录音界面文字区仅展示草稿文本，用户反馈实用性低。

**约束**：
- 不改动麦克风采集链路（`useRecording.ts` / Web Audio API / AudioWorklet）。
- 保持离线转写任务队列、AI 分析、说话人分离等已有功能完全不动。
- 删除后不引入任何新依赖，后处理完全复用已打包的 ffmpeg/ffprobe。

**利益相关方**：
- 用户：去掉低质量草稿，换取零成本的实用录音后处理（压缩省空间、降噪）。
- 维护者：代码瘦身（删代码 > 加代码），打包体积减 ~100MB，架构简化（录音 ⊥ 识别）。

## Goals / Non-Goals

**Goals:**
- 移除实时转写能力与流式识别引擎，简化架构并瘦身打包。
- 将 WAV 写盘逻辑从 recognizer 剥离为独立 `AudioRecorder`，解耦录音与识别。
- 新增录音后处理流水线（降噪/静音裁剪/响度归一/压缩编码），零新依赖，单条 ffmpeg 滤镜链一次完成。
- 录音界面替换文字区为后处理开关面板，支持全局默认 + 本次覆盖。
- 保持录音记录存储/列表/详情与离线转写入口不变。

**Non-Goals:**
- 改造离线转写任务队列或 AI 分析逻辑（保持原样）。
- 录音中打点书签等需要动采集链路的功能（采集层不动）。
- UI 设计稿或视觉规范（仅交付功能实现）。
- 多语言 / 自定义流式引擎（能力整块移除，不做分支保留）。

## Decisions

### 1. AudioRecorder 独立抽取策略

**决策**：新建 `src/main/audio/AudioRecorder.ts`，接管 WAV 流式写盘逻辑。`recordingHandlers.ts` 中的 `start-recording` / `audio-chunk` / `stop-recording` 不再创建 recognizer，改为创建 AudioRecorder。

**方案细节**：
- `AudioRecorder` 在 `initialize()` 时打开文件描述符并写 44 字节占位符头。
- `feedAudio(chunk: Float32Array)` 立即追加写入 PCM 数据，维护 `totalSamplesWritten` 计数。
- `finalize()` 补全 WAV 头的 `data` size 与 `RIFF` size，关闭文件，返回 `{ filePath, duration, fileSize }`。
- `cleanup()` 关闭未完成的文件描述符以防泄漏。

**考虑的备选**：
- A. 仍保留 recognizer 但在 feedAudio 时判断"是否转写"开关 → 否决：recognizer 初始化成本（模型加载）仍然存在，且代码未真正解耦。
- B. 抽象 `IAudioRecorder` 接口，为未来流式识别预留扩展点 → 否决：YAGNI，当前无复用需求，过度抽象不如简单直接。

### 2. 后处理滤镜链顺序与合并

**决策**：所有勾选的音频处理项合并为一条 ffmpeg 命令，滤镜顺序固定为 `afftdn → silenceremove → loudnorm`，编码在最后一次输出。

**顺序理由**：
- `afftdn` 降噪在前：静音裁剪依赖振幅判断，先降噪可减少误判。
- `silenceremove` 裁静音居中：去掉首尾与长静音后再归一，避免对无效段浪费归一计算。
- `loudnorm` 响度归一在后：归一作用于全音频统计，应在裁剪后最终阶段。

**命令示例**：
```bash
ffmpeg -i 原始.wav -af "afftdn=nf=-25,silenceremove=start_periods=1:start_silence=0.2:start_threshold=-40dB:stop_periods=1:stop_silence=0.5:stop_threshold=-40dB,loudnorm=I=-16:TP=-1.5:LRA=11" -c:a aac -b:a 64k 成品.m4a
```

**考虑的备选**：
- A. 每项处理分步执行，中间产生临时文件 → 否决：多次编解码损失音质，IO 放大（30MB WAV × 4 步 = 120MB 临时盘占用），处理慢。
- B. 允许用户自定义滤镜顺序 → 否决：音频处理顺序有客观优劣（如降噪必在前），开放自定义反而引入错误配置隐患，增加 UI 复杂度。

### 3. 原始文件保留策略实现

**决策**：`保留原始 WAV` 作为用户可勾选项。不保留时，后处理成功后 `unlinkSync` 删除原始 WAV，录音记录主路径指向成品；保留时，两份文件都留，记录扩展字段 `originalFilePath` 指向原始，主 `filePath` 仍指向成品。

**数据模型**：
```typescript
// realtime_recordings 表增加可选字段
interface RealtimeRecording {
  // ... 既有字段
  filePath: string               // 主路径（成品或原始）
  originalFilePath?: string      // 后处理时若保留原始则填充
  postProcessing?: {             // 记录本次所用后处理配置
    denoised: boolean
    trimmed: boolean
    normalized: boolean
    compressed: boolean
    format?: 'm4a' | 'mp3'
  }
}
```

**考虑的备选**：
- A. 始终保留原始 WAV 不删除 → 否决：违背用户选择"压缩省空间"的初衷，录音多了磁盘翻倍占用。
- B. 固定策略：不保留或固定保留 7 天 → 否决：不同用户诉求差异大，有人不在乎空间、有人极度节省，强加策略必然不满。
- C. 原始 WAV 自动转移到回收站/临时目录 N 天后清理 → 备选（可后续增强），当前先实现用户勾选的简单策略。

### 4. 后处理异步执行与进度反馈

**决策**：`stop-recording` 返回原始 WAV 信息后，若有后处理则调用异步函数 `processRecording(filePath, options)` 在 Main 进程后台执行，通过 `postprocessing-progress` IPC 事件推送进度。

**实现方式**：
- ffmpeg 命令启用 `-progress pipe:1`，解析输出中的 `out_time_us` 推算进度百分比。
- 每 500ms 节流推送一次 `{ recordingId, progress: 0..1 }`，Renderer 更新进度条。
- 完成后推送 `postprocessing-complete` 事件，失败推送 `postprocessing-error`。

**考虑的备选**：
- A. 同步执行，用户等待 → 否决：降噪可能需数秒至十几秒（取决于录音时长），阻塞 UI 体验差。
- B. 扔进现有任务队列 → 否决：任务队列设计面向离线长时转写（SenseVoice 数十秒/分钟），后处理几秒即完成，混入会稀释任务列表的语义。

### 5. 录音时长上限调整

**决策**：从原 30 分钟放宽至 120 分钟。逻辑从 recognizer 搬至 AudioRecorder，以 `Date.now() - startTime > MAX_DURATION_MS` 判定，达到后自动调用 `finalize()`。

**理由**：
- 30 分钟限制来自流式识别的内存/模型约束，纯录音无此限制。
- 会议/采访/课堂场景 1-2 小时常见，120 分钟覆盖主流需求同时避免无限录音导致磁盘撑爆。
- 120 分钟 16kHz mono WAV ≈ 230MB，M4A 压缩后 <30MB，在可接受范围。

**考虑的备选**：
- A. 完全取消上限 → 否决：边界保护缺失，用户忘记停止可能录数小时耗尽磁盘（虽然概率低，但代码应对异常负责）。
- B. 改为可配置上限 → 备选（可后续增强），当前固定 120 分钟先满足主流场景。

### 6. 设置项迁移与清理

**决策**：移除 `realtimeEngineConfig`（含 engine / zipformerParams / qwen3Params）；新增 `recordingPostProcessing` 设置组。

**新增设置结构**：
```typescript
interface RecordingPostProcessingSettings {
  denoise: boolean              // 默认 false
  trimSilence: boolean          // 默认 false
  normalizeLoudness: boolean    // 默认 false
  compress: boolean             // 默认 true（推荐省空间）
  compressFormat: 'm4a' | 'mp3' // 默认 'm4a'
  keepOriginal: boolean         // 默认 false
}
```

**向后兼容**：旧设置若含 `realtimeEngineConfig` 则启动时静默忽略，不报错；`recordingPostProcessing` 不存在则填充上述默认值。

### 7. 浮动录音窗口同步处理

**决策**：`start-floating-recording` / `stop-floating-recording` 与全屏录音 Modal 共用同一套 AudioRecorder 与后处理流程，开关取自全局默认（浮动窗口不提供临时覆盖面板，简化 UI）。

**理由**：浮动窗口定位"最小化干扰快速录音"，过多配置项违背初衷。全局默认已能覆盖常用场景。

## Risks / Trade-offs

### [风险] 用户误删原始 WAV 后无法还原降噪/裁剪

**场景**：用户未勾选"保留原始"，后处理产出不满意，但原始 WAV 已删。

**缓解**：
- 录音停止后立即显示"即将应用后处理，原始录音将被删除"明确提示，带倒计时与"取消"按钮。
- 或默认勾选"保留原始"，把节省空间变成用户主动选择而非默认行为（推荐）。

### [权衡] 单条滤镜链无法撤销单步

**场景**：用户只想撤销降噪但保留响度归一。

**当前方案**：无法支持，后处理是一次性不可逆操作（除非保留了原始 WAV 可重新处理）。

**未来备选**：支持"从原始重新后处理"功能，前提是保留了原始。

### [权衡] 异步后处理期间不可关闭应用

**现状**：如果用户在后处理进行中强制关闭应用，ffmpeg 子进程被杀，成品半成品都丢失，只剩原始（如果保留）。

**缓解**：
- 应用退出前拦截，检查是否有后处理进行中，弹窗警告"录音处理中，是否等待完成？"。
- 或将后处理改为可恢复任务（写状态到数据库），下次启动自动补跑 → 复杂度高，暂不实现。

### [权衡] ffmpeg 不可用时功能降级

**场景**：打包错误或用户修改 resources 导致 ffmpeg 二进制缺失。

**缓解**：
- 启动时检测 `getFfmpegPath()` 指向文件是否存在，若不存在则在后处理面板禁用所有开关并显示提示。
- 录音本身不受影响（AudioRecorder 不依赖 ffmpeg），只是后处理不可用。

## Migration Plan

### 部署步骤

1. **代码合并顺序**：
   - 先提交 `AudioRecorder.ts` 与单元测试（可独立运行）。
   - 再提交 `recordingHandlers.ts` / `useRecording.ts` 改造（切换到 AudioRecorder）。
   - 最后提交后处理流水线与 UI 改动（新增面板）。

2. **数据库迁移**：
   - `realtime_recordings` 表增加可选字段 `originalFilePath` 与 `postProcessing` JSON。
   - 旧记录不回填，遇到时解释为"无后处理信息，直接使用 filePath"。

3. **打包配置**：
   - 从 `package.json` 的 `extraResources` 移除 `sherpa-onnx-streaming-zipformer-zh-int8-2025-06-30`。
   - 删除 `src/main/utils/paths.ts` 中流式模型校验与路径获取函数。

4. **设置迁移**：
   - 启动时检测 `settings.realtimeEngineConfig` 存在则静默忽略。
   - 不存在 `settings.recordingPostProcessing` 则填充默认值（compress: true, 其余 false）。

### 回滚策略

若用户反馈强烈要求恢复实时转写，代码层面可通过 git revert 恢复（删除与新增清晰分离），但需：
- 重新打包流式模型（~100MB）。
- 恢复 `realtimeEngineConfig` 设置项与对应 UI。
- 回滚成本：约 2 人日。

**决策点**：上线后观察 2 周，如无实质性回滚诉求则正式归档本 change。

## Open Questions

1. **压缩格式默认 M4A 还是 MP3？**  
   - 当前倾向 M4A（AAC 64kbps）：质量优于同码率 MP3，体积相当，兼容性主流设备无问题。  
   - 但如果用户群偏 Windows 老版本或非苹果生态，MP3 兼容性更稳妥。  
   - **建议**：默认 M4A，设置中可切换 MP3。

2. **降噪滤镜 afftdn 参数调优**  
   - 当前 `afftdn=nf=-25`（噪声底噪级），未针对不同麦克风校准。  
   - 可能需要根据用户反馈微调 `nf` / `tn` 参数。  
   - **建议**：先用保守值上线，收集反馈后迭代。

3. **响度归一 loudnorm 的目标响度值**  
   - 当前 `I=-16 LUFS`（播客标准），对会议录音可能偏响。  
   - **建议**：-16 LUFS 先行，如反馈"太响"可调至 -18 或 -20。

4. **后处理失败是否自动重试？**  
   - 当前设计：失败后提示用户"使用原始/重试"，手动操作。  
   - 备选：自动重试一次（考虑临时 IO 故障）。  
   - **建议**：先不自动重试，避免循环卡死，由用户判断。
