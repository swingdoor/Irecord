# IRecord — 本地离线语音转写工具 需求说明书

## 1. 产品概述

IRecord 是一款基于 Windows 的本地离线语音转写桌面应用，面向对隐私和数据安全有要求的用户。所有语音识别在本地 CPU 上完成，无需联网，不上传任何数据。

### 1.1 目标用户

- 需要将会议录音、访谈、讲座等音视频转为文字的个人或团队
- 对数据隐私有要求，不希望音频上传至云端
- 需要识别多人对话中"谁说了什么"的场景

### 1.2 技术栈

| 层级 | 技术选型 |
|------|----------|
| 桌面框架 | Electron |
| 前端 | React + TypeScript + TailwindCSS |
| 状态管理 | Zustand |
| ASR 引擎 | sherpa-onnx-node（独立子进程运行） |
| 数据库 | sql.js（纯 WASM SQLite） |
| 中文分词 | nodejieba |
| 音频处理 | FFmpeg（外部二进制） |

## 2. 功能需求

### 2.1 语音识别（Change 1: MVP）

**核心能力**：将音频/视频文件转写为文字。

- 支持格式：WAV、MP3、FLAC、M4A、AAC、OGG、WMA、MP4、MKV、AVI、MOV 等
- 非 WAV 格式自动通过 FFmpeg 转换为 16kHz 单声道 WAV
- 单文件时长上限：2 小时
- 识别结果包含：全文文本、分段文本、时间戳
- 支持导出为 TXT 文件（含时间戳、说话人标签、关键词摘要）
- 支持复制全文到剪贴板

### 2.2 说话人分离（Change 2: Speaker Diarization）

**核心能力**：识别多人对话中每段话的说话人。

- 使用 pyannote 分割模型 + 3D-Speaker 嵌入模型实现说话人聚类
- 自动检测说话人数量，无需用户预设
- 三级识别策略（按模型可用性自动选择）：
  1. **说话人分离**（segmentation + embedding 模型均存在）：完整的说话人标注
  2. **VAD 分段**（仅 Silero VAD 模型存在）：按语音活动分段，无说话人标签
  3. **整体识别**（无额外模型）：全文一次性识别
- 后处理逻辑：
  - 重叠片段裁剪（裁剪前段结束时间）
  - 相邻同说话人段合并（间隔 < 2 秒）
  - 超长段强制切分（上限 30 秒，避免 Transformer O(n²) 性能问题）
- 结果页按说话人着色显示（8 色循环）
- 显示说话人统计：段数、总时长

### 2.3 关键词提取（Change 3: Keyword Extraction）

**核心能力**：从转写文本中自动提取关键词。

- 使用 nodejieba TF-IDF 算法提取 Top 10 关键词
- 过滤停用词、单字、纯数字、标点符号
- 结果页显示可点击的关键词标签
- 点击关键词高亮文本中所有匹配位置
- 导出 TXT 时包含关键词摘要

### 2.4 任务管理（Change 4: Task Management）

**核心能力**：支持批量文件处理和任务队列。

- 主页为任务列表，按状态分组显示：进行中、已停止、已完成、失败
- 支持批量添加文件（文件选择器或拖放）
- 串行任务队列：同一时间只处理一个任务，完成后自动处理下一个
- 任务状态流转：
  ```
  pending → processing → completed
                       → failed
                       → stopped（用户取消）
  stopped/failed → pending（重新开始）
  任意状态 → 删除（从数据库移除）
  ```
- 处理中任务显示实时计时器
- 应用退出时：终止子进程，processing 任务重置为 pending
- 应用启动时：自动重置残留的 processing 任务为 pending
- SQLite 持久化存储任务和结果

### 2.5 多模型支持（Change 5: Multi-Model）

**核心能力**：支持多个 ASR 模型，用户可按需选择。

| 模型 | 参数量 | 特点 | 模型目录 |
|------|--------|------|----------|
| Qwen3-ASR 0.6B (INT8) | 0.6B | 高精度，52 语言 | resources/models/qwen3-asr |
| SenseVoice Small (INT8) | ~234M | 轻量快速，中英日粤韩 | resources/models/sensevoice-small |

- 任务列表页提供模型选择下拉框（仅显示已下载的模型）
- 每个任务记录使用的模型类型（`modelType` 字段）
- 结果详情页显示使用的模型名称
- 模型配置差异：
  - Qwen3-ASR：convFrontend + encoder + decoder + tokenizer，maxTotalLen=4096
  - SenseVoice：单一 model.int8.onnx + tokens.txt，useInverseTextNormalization=1

## 3. 架构设计

### 3.1 进程模型

```
┌─────────────────────────────────────────────────┐
│                 Electron Main                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ IPC 层   │  │ 任务队列  │  │ SQLite (WASM)│  │
│  └────┬─────┘  └────┬─────┘  └──────────────┘  │
│       │              │                           │
│       │         spawn('node')                    │
│       │              │                           │
│  ┌────┴─────────────┐│                           │
│  │  Renderer (React) ││                           │
│  └──────────────────┘│                           │
└──────────────────────┼──────────────────────────┘
                       │ stdin/stdout JSON
              ┌────────┴────────┐
              │  asr-process.js │  ← 独立 Node.js 进程
              │  sherpa-onnx-node│
              └─────────────────┘
```

**关键设计决策**：sherpa-onnx-node 必须在独立的 Node.js 子进程中运行，因为 Electron 的 V8 沙箱禁止 native addon 使用 external buffer。通过 `child_process.spawn('node', [...])` 创建完全独立的进程，通过 stdin 传入参数（JSON），通过 stdout 接收进度和结果（JSON Lines）。

### 3.2 数据流

1. 用户通过文件选择器或拖放添加文件
2. IPC handler 验证文件格式和时长，创建任务记录（status: pending）
3. 任务队列取出下一个 pending 任务，FFmpeg 转换为 WAV（如需要）
4. spawn 子进程执行 ASR，子进程根据可用模型自动选择策略
5. 子进程通过 stdout 发送 progress 事件和最终 result
6. 主进程解析结果，存入数据库，通知前端刷新
7. 前端从 store 获取任务列表和结果数据

### 3.3 数据库表结构

**tasks 表**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT PK | UUID |
| fileName | TEXT | 原始文件名 |
| filePath | TEXT | 文件路径 |
| fileSize | INTEGER | 文件大小（字节） |
| duration | REAL | 音频时长（秒） |
| status | TEXT | pending/processing/completed/failed/stopped |
| modelType | TEXT | qwen3-asr / sensevoice-small |
| strategy | TEXT | speaker-diarization / vad / plain |
| error | TEXT | 错误信息 |
| createdAt | TEXT | 创建时间 ISO |
| completedAt | TEXT | 完成时间 ISO |
| processingTime | REAL | 处理耗时（秒） |
| wordCount | INTEGER | 字数 |

**results 表**

| 字段 | 类型 | 说明 |
|------|------|------|
| taskId | TEXT PK | 关联 tasks.id |
| text | TEXT | 全文文本 |
| segments | TEXT | 分段 JSON（含时间戳、说话人） |
| speakerStats | TEXT | 说话人统计 JSON |
| keywords | TEXT | 关键词 JSON |
| lang | TEXT | 语言代码 |
| strategy | TEXT | 使用的策略 |

## 4. 界面设计

### 4.1 任务列表页（主页）

- 顶部：标题 + 模型选择下拉框 + 添加文件按钮
- 任务分组：进行中（蓝色）、已停止（灰色）、已完成（白色）、失败（红色）
- 进行中：显示文件名、状态（识别中/排队中）、实时计时、取消/删除按钮
- 已完成：显示文件名、字数、耗时、完成时间，点击进入详情
- 已停止/失败：显示文件名、错误信息，重新开始/删除按钮
- 支持拖放文件到页面任意位置

### 4.2 结果详情页

- 顶部：返回按钮 + 时间戳开关 + 复制 + 导出 TXT
- 摘要栏（5 列）：文件名、模型、字数、耗时、策略（含说话人数）
- 说话人统计条（如有）：彩色圆点 + 名称 + 段数/时长
- 关键词标签栏：点击高亮，再次点击取消
- 正文区域：
  - 时间戳模式：分段显示，含时间范围、说话人标签、着色背景
  - 纯文本模式：全文显示

## 5. 非功能需求

- **离线运行**：所有功能不依赖网络
- **隐私安全**：音频数据不离开本地
- **平台**：Windows 10/11（x64）
- **性能**：CPU 推理，支持多线程（默认 4 线程）
- **存储**：模型文件约 600MB（Qwen3-ASR）+ 约 200MB（SenseVoice），数据库按需增长

## 6. 未来规划

| 编号 | 功能 | 说明 |
|------|------|------|
| Change 6 | GPU 加速 | 支持 CUDA/DirectML 推理加速 |
| Change 7 | 高级导出 | SRT 字幕、Word 文档、Markdown 等格式 |
| Change 8 | 应用打包 | electron-builder 打包为可分发安装包 |

