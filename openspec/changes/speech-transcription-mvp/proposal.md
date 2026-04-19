## Why

开发一款本地语音识别转写工具的 MVP 版本，验证技术可行性并快速交付可用产品。当前市场上的语音转写工具要么依赖云端（隐私问题），要么功能复杂难以上手。我们需要一个简单、本地化、开箱即用的基础版本，作为后续功能（说话人分离、标点预测、批量处理等）的基础平台。

## What Changes

- 创建 Electron 桌面应用框架（React + TailwindCSS）
- 集成 Sherpa-ONNX 语音识别引擎（CPU 模式）
- 集成 Qwen3-ASR-0.6B 模型（支持 52 种语言，重点优化中文）
- 实现音频/视频文件上传功能（拖放 + 文件选择）
- 实现基础语音识别流程（音频预处理 → ASR → 结果展示）
- 提供词级时间戳输出
- 实现简单的进度显示
- 支持 TXT 格式导出
- 基础错误处理和用户提示

## Capabilities

### New Capabilities
- `audio-file-upload`: 支持音频/视频文件上传，包括拖放和文件选择器，支持 MP3/WAV/MP4/M4A 等常见格式
- `audio-preprocessing`: 音频预处理能力，包括格式转换、重采样到 16kHz、提取视频音轨
- `speech-recognition`: 基于 Sherpa-ONNX + Qwen3-ASR-0.6B 的语音识别能力，输出文本和词级时间戳
- `transcription-display`: 转写结果展示，包括文本内容和时间戳信息
- `text-export`: 文本导出功能，支持 TXT 格式，包含时间戳选项
- `processing-progress`: 处理进度追踪和展示，包括百分比和状态信息

### Modified Capabilities
<!-- 无现有 capabilities 需要修改 -->

## Impact

**新增代码**:
- Electron 主进程和渲染进程代码
- React 前端组件（文件上传、结果展示、导出）
- Sherpa-ONNX Node.js 绑定集成代码
- 音频处理 Worker 线程

**新增依赖**:
- `electron` (^32.0.0)
- `react` (^18.3.0)
- `sherpa-onnx` (^1.12.0)
- `fluent-ffmpeg` (^2.1.3)
- `tailwindcss` (^3.4.0)

**新增资源**:
- Qwen3-ASR-0.6B 模型文件 (~600MB)
- FFmpeg 二进制文件 (~50MB)

**系统要求**:
- Windows 10/11
- 最低 8GB 内存
- 4 核 CPU
- 2GB 可用磁盘空间
