## Context

`remove-realtime-transcription` change 移除了实时转写并引入后处理流水线，但实施留下三处问题需收口：

1. **后处理 UI 错位**：`RecordingModal.tsx` 拿到了完整的后处理开关+进度 UI，但它从未被任何路由引用（死代码）。实际使用的是 `App.tsx` 路由的 `RecordingPage.tsx`，它没有后处理界面。
2. **浮动录音/快捷键失去意义**：这两个功能原本服务于"快速唤起实时转写"，实时转写删除后已无价值，但代码仍在。
3. **实时引擎残留**：`engines.ts`/`registry.ts` 仍定义流式引擎，污染模型管理页。

**关键约束（来自用户决策）**：
- 转写任务**始终用原始 WAV**（无损、采样率原生，转写质量最稳）。
- 原始 WAV **默认保留**。
- 后处理开关在"停止后"阶段才出现（录音时界面纯净）。

**这些约束的深远影响**：转写读原始、后处理产出成品（独立文件），两者操作不同文件，**彻底消除了文件读写竞态**——这正是之前 `Failed to read WAV` 报错担心的问题，被数据契约从根上解决。

## Goals / Non-Goals

**Goals:**
- 移除浮动录音窗口与全局快捷键的全部代码与残留。
- 把后处理 UI 从死代码 `RecordingModal` 迁移到 `RecordingPage`，并删除 Modal。
- `RecordingPage` 重构为四阶段工作流，停止后提供后处理配置与 A/B 对比试听。
- 简化主进程录音状态判断（用 `audioRecorder` 实例，删独立状态机）。
- 清理实时引擎定义，模型管理页不再显示"实时转写模型"。

**Non-Goals:**
- 不改动 AudioRecorder 录音核心、postProcessing 滤镜链逻辑（已在上个 change 完成）。
- 不改动离线转写任务队列、说话人分离、AI 分析。
- 不做录音中打点书签（采集链路不动）。
- 不做后处理参数（降噪强度等）的可视化调节（仍走固定滤镜参数）。

## Decisions

### 1. 录音状态机：删除独立状态，用 AudioRecorder 实例作单一事实来源

**决策**：删除 `floatingRecorder.ts` 中的 `RecordingMode` 枚举（`idle/floating/fullscreen/saving`）及 `getRecordingState`/`setRecordingState`/`canStartRecording`。主进程判断"是否录音中"直接看模块级 `audioRecorder: AudioRecorder | null`。

**理由**：
- 砍掉浮动后，全局只剩一个录音消费者（全屏录音），`floating`/`fullscreen` 区分消失。
- `audioRecorder !== null` 天然表达"正在录音"，独立状态变量是冗余的二次记录，有不一致风险。
- 少一个文件、少一个枚举、状态单一来源。

**实现**：
```typescript
// recordingHandlers.ts
let audioRecorder: AudioRecorder | null = null

// start-recording: 判断能否开始
if (audioRecorder) return { error: '已有录音正在进行中' }

// stop-recording: 判断有无录音
if (!audioRecorder) return { error: '没有正在进行的录音' }
```

**考虑的备选**：
- A. 新建 `recordingState.ts` 承接状态机 → 否决：仍是冗余状态，AudioRecorder 实例已是事实来源。
- B. 保留 floatingRecorder.ts 仅留状态函数 → 否决：文件名与残留语义误导，不如彻底删除。

### 2. 前端四阶段状态机

**决策**：`RecordingPage` 内部维护 UI 阶段状态，驱动区域渐进展开。

**状态流转**：
```
idle → recording ⇄ paused → stopped
                                │
                  ┌─────────────┴─────────────┐
            (勾了后处理)                  (没勾/跳过)
                  │                           │
              processing → done ──────────────┘
                  │
               (失败) → done (降级提示，仍可用原始)
```

**四阶段 UI**：
- **① recording/paused**：纯净，仅波形 + 计时 + 暂停/停止。
- **② stopped（配置）**：原始 WAV 试听（AudioPlayer）+ 后处理开关面板 + "同时创建转写"勾选 + 操作按钮。
- **③ processing**：进度条 + 当前步骤文案（"降噪 → 压缩..."），原始试听仍可用。
- **④ done**：成品试听（AudioPlayer）+ 原始试听（若保留）+ 体积对比 + 保存/转写状态确认。

**考虑的备选**：
- A. 停止后直接处理（不出配置阶段）→ 否决：用户决策明确要"停止后才出选项"，且配置阶段能让用户先试听原始再决定是否处理。
- B. 用 Modal 弹层做配置 → 否决：录音页本身就是全屏页，再叠 Modal 割裂体验；垂直流动更顺。

### 3. 双文件数据模型与转写契约

**决策**：原始 WAV 与后处理成品是两个独立文件，职责分离。

```typescript
interface RealtimeRecording {
  filePath: string            // 主展示路径：成品(若有后处理) 或 原始
  originalFilePath?: string   // 原始 WAV 路径(默认保留时填充)
  postProcessing?: string     // JSON: 本次所用后处理配置
  // ...
}
```

**转写契约**：`create-proofreading-task` 优先用 `originalFilePath`，回退到 `filePath`：
```typescript
const transcriptionSource = recording.originalFilePath || recording.filePath
```

**理由**：
- 转写要无损原始音频，后处理（尤其有损压缩）会降低识别质量。
- 默认保留原始 → `originalFilePath` 总是存在 → 转写总有无损源。
- 用户主动删原始（取消保留）→ 回退用 filePath（成品），可接受。

**A/B 对比试听**：成品和原始各用一个 `AudioPlayer` 实例，用户可分别播放对比降噪/裁剪效果。

### 4. 后处理触发时机调整

**决策**：从上个 change 的"stop-recording 后立即异步处理"改为"停止进入配置阶段，用户在阶段②点击'处理并存'才触发"。

**理由**：
- 用户决策"停止后才出选项"。
- 用户主动触发符合"后处理是用户操作"的心智，也避免了"还没看清就开始跑"。
- `stop-recording` IPC 只负责 finalize 原始 WAV 并返回；后处理走独立的 `process-recording` IPC（携带本次勾选的 options）。

**实现**：
```typescript
// stop-recording: 只 finalize，返回原始信息
// 新 IPC: process-recording(filePath, options)
//   → 复用现有 processRecording()，进度走 postprocessing-progress
```

### 5. 浮动/快捷键删除的连锁清理

**决策**：按依赖顺序清理，避免编译中断。

**删除波及链**：
```
globalShortcuts.ts ──依赖──→ floatingRecorder.ts (状态+窗口函数)
index.ts ──调用──→ globalShortcuts (register/unregister)
recordingHandlers.ts ──import──→ floatingRecorder (状态函数)
App.tsx ──路由──→ FloatingRecorderPage
preload ──暴露──→ floating/shortcut 接口
```

**清理顺序**：先删上层调用（index.ts、App.tsx、preload），再删 handler 的 floating 部分并改状态判断，最后删 floatingRecorder.ts / globalShortcuts.ts / FloatingRecorderPage.tsx / RecordingSaveDialog.tsx。

### 6. 实时引擎残留清理（牵连模型管理页）

**决策**：删除引擎定义并移除模型管理页的"实时转写模型"分组。

**波及链**：
```
engines.ts (删 2 引擎 + getRealtimeModels/Ids)
  → settingsHandlers.ts (删 realtimeModels 计算与返回)
    → preload getModelRegistry (删 realtimeModels 字段)
      → SettingsModal (删 realtimeModels state + "实时转写模型"分组渲染)
registry.ts (删 streaming-zipformer-zh 条目)
```

## Risks / Trade-offs

### [风险] 删除浮动/快捷键波及 recordingHandlers 状态判断

**场景**：recordingHandlers 当前 import `canStartRecording`/`setRecordingState`，删除后若遗漏改动会编译失败。

**缓解**：按"先删调用→改 handler→删文件"顺序，每步可编译验证。改动集中在 recordingHandlers 的 start/stop 判断。

### [权衡] 四阶段 UI 比单页录音复杂

**场景**：状态多了，渲染分支增多。

**缓解**：用清晰的 stage 枚举驱动条件渲染；每个阶段是独立区域块，互不嵌套；复用 AudioPlayer 减少新组件。

### [风险] 用户取消"保留原始"且转写成品质量下降

**场景**：用户取消保留原始 + 压缩成 MP3，则转写回退用 MP3 成品，质量降低。

**缓解**：
- "保留原始"默认勾选，用户需主动取消。
- 取消保留时，若同时勾了转写，给提示"转写将使用压缩后音频，可能影响精度"。

### [权衡] RecordingSaveDialog 删除后浮动保存逻辑丢失

**场景**：该组件含保存录音的表单逻辑。

**缓解**：保存逻辑本质是调用 `saveRealtimeRecording`，RecordingPage 的完成阶段已有等价实现，无需迁移组件本身。

## Migration Plan

1. **清理顺序**（保证每步可编译）：
   - Step 1：删 index.ts 快捷键、App.tsx 浮动路由、preload 浮动接口（上层先断）。
   - Step 2：改 recordingHandlers——删 floating handler，状态判断改用 audioRecorder 实例。
   - Step 3：删 floatingRecorder.ts / globalShortcuts.ts / FloatingRecorderPage.tsx / RecordingSaveDialog.tsx / RecordingModal.tsx。
   - Step 4：清实时引擎残留（engines/registry/settingsHandlers/preload/SettingsModal）。
   - Step 5：清 useRecording 旧设置读取。
   - Step 6：重构 RecordingPage 四阶段 + 接线后处理 IPC。

2. **数据兼容**：`originalFilePath` 为新字段（上个 change 已加列），旧记录无此字段时 `create-proofreading-task` 回退用 `filePath`。

3. **验证**：每个 Step 后 `npm run build`；最后 `npm run dev` 手测四阶段。

## Open Questions

1. **阶段②"跳过处理直接存" vs "处理并存"两个按钮，措辞是否清晰？**
   - 备选：单个"保存"按钮 + 后处理开关，勾了就处理、没勾就直存（更少按钮）。
   - 建议：先用单按钮"保存录音"，根据是否勾选后处理项自动决定走③还是直接④。

2. **阶段④是否直接显示转写任务入口/状态？**
   - 转写任务在阶段②勾选时已创建并入队，阶段④可显示"转写任务已创建，可在任务列表查看"。
   - 建议：显示状态文案 + "去任务列表"链接，不在录音页内嵌转写进度。

3. **后处理失败降级时，是否自动用原始保存？**
   - 建议：失败提示后，成品区显示"处理失败"，保存时用原始 WAV 作为 filePath，originalFilePath 留空（因为就是它本身）。
