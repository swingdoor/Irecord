# iRecord 你说我记

本地离线语音识别转写工具，基于 Electron + Sherpa-ONNX。录音或上传音视频，本地转写成文字，再借助大模型整理成结构化知识文档。音频识别全程本地运行不联网；知识整理可选接入云端 LLM。

> 当前版本：v0.9.1 · 平台：Windows 10/11

## 功能特性

### 录音与转写
- 🎙️ 应用内录音，录制结束后进入转写工作流
- 📁 上传本地音视频文件转写：音频 MP3 / WAV / FLAC / AAC / M4A / OGG，视频 MP4 / AVI / MKV / MOV / FLV（自动提取音轨）
- 🌏 多语言识别：中文、英文、日语、韩语、粤语
- 🔀 双 ASR 引擎可切换：
  - **SenseVoice Small**（默认内置，~240MB）：轻量快速
  - **Qwen3-ASR 0.6B**（可选下载，~950MB）：高精度，效果最佳
- 👥 说话人分离：区分多人对话（pyannote 分割 + 3D-Speaker 嵌入）
- 🔇 语音活动检测（Silero VAD），自动跳过静音
- ⏱️ 词级时间戳，精确到每个词的时间位置

### 知识整理
- 🤖 接入大模型，将转写文本整理成结构化文档（全文摘要、要点提炼、发言人归纳等）
- 🏷️ 关键词提取（nodejieba 分词）
- 📝 内置富文本编辑器（TipTap），可二次编辑整理结果
- 🧩 可配置 LLM 服务商：阿里百炼（DashScope）、DeepSeek，支持自定义模型

### 任务与导出
- 📋 任务队列管理，转写后台处理
- 💾 本地数据库持久化（sql.js）
- 📤 导出 TXT（可选时间戳）

## 系统要求

- Windows 10/11
- 4GB+ RAM
- 2GB+ 磁盘空间（默认模型约 290MB，启用 Qwen3-ASR 另需约 950MB）

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 准备模型文件

默认 ASR 模型（SenseVoice）及辅助模型（VAD、说话人分离）放在 `resources/models/` 目录下：

```
resources/models/
├── sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/   # 默认 ASR，内置
├── sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25/           # 高精度 ASR，可选
├── silero-vad/                                            # 语音活动检测
└── speaker-diarization/                                   # 说话人分离
```

可使用脚本下载：

```bash
bash scripts/download-models.sh
```

Qwen3-ASR 也可在应用「设置 → 模型管理」中按需下载。

### 3. 准备 FFmpeg（处理视频/非标准音频时需要）

1. 访问 https://www.gyan.dev/ffmpeg/builds/
2. 下载 Windows 版本（ffmpeg-release-essentials.zip）
3. 解压后将 `ffmpeg.exe` 复制到 `resources/ffmpeg/` 目录

### 4. 配置 LLM（使用知识整理功能时需要）

在应用「设置」中填入 LLM 服务商的 API Key。音频转写本身不依赖此配置。

### 5. 运行应用

```bash
npm run dev
```

## 使用说明

1. **录音或上传**：点击录音开始录制，或拖放/选择本地音视频文件
2. **开始转写**：提交任务，后台队列处理，可在任务列表查看进度
3. **查看结果**：转写完成后进入详情页，查看带时间戳/说话人的文本
4. **整理知识**：选择模板，调用 LLM 生成摘要、要点等结构化文档，并可在编辑器中修改
5. **导出**：导出 TXT（可选时间戳）

详细操作见 [docs/使用说明.md](docs/使用说明.md)。

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Electron 41 |
| 前端 | React 19 + TypeScript + TailwindCSS 4 + Ant Design 6 |
| 状态管理 | Zustand |
| 富文本编辑 | TipTap 3 |
| 语音识别 | Sherpa-ONNX（SenseVoice / Qwen3-ASR） |
| 说话人分离 | pyannote-segmentation + 3D-Speaker |
| 中文分词 | nodejieba |
| 音频处理 | FFmpeg（fluent-ffmpeg） |
| 知识整理 | LLM（DashScope / DeepSeek，OpenAI 兼容接口） |
| 数据持久化 | sql.js |
| 构建 | electron-vite + electron-builder |

## 项目结构

```
src/
├── main/                 # 主进程
│   ├── audio/            # 录音、FFmpeg、后处理、WAV 工具
│   ├── db/               # 数据库
│   ├── engine/           # ASR 子进程
│   ├── ipc/              # IPC 处理器（任务/录音/文件/分析/知识/设置）
│   ├── keywords/         # 关键词提取
│   ├── llm/              # LLM 客户端、服务商、提示词
│   ├── models/           # 模型注册表、下载、状态
│   ├── services/         # 文件管理
│   └── utils/            # 路径、设置、错误处理
├── preload/              # 预加载脚本
└── renderer/             # 渲染进程（React）
    └── src/
        ├── components/   # UI 组件
        ├── pages/        # 页面
        ├── hooks/        # React Hooks
        └── stores/       # Zustand 状态
```

## 开发

```bash
npm run dev          # 开发模式
npm run typecheck    # 类型检查
npm run build        # 构建
node scripts/test-e2e.js  # 端到端识别测试
```

## 打包

```bash
npm run build:win           # 构建 NSIS 安装包
npm run build:win:portable  # 构建免安装版
```

产物输出到 `release/<version>/`。

## 限制

- 仅支持 CPU 推理（暂不支持 GPU 加速）
- Qwen3-ASR 模型较大（~950MB），首次加载需数秒
- 知识整理功能依赖外部 LLM 服务，需联网并配置 API Key

## 许可证

MIT

## 致谢

- [Sherpa-ONNX](https://github.com/k2-fsa/sherpa-onnx) - 高性能语音识别推理框架
- [Qwen3-ASR](https://github.com/QwenLM/Qwen3-ASR) - 阿里云通义千问语音识别模型
- [SenseVoice](https://github.com/FunAudioLLM/SenseVoice) - 多语言语音识别模型
- [FFmpeg](https://ffmpeg.org/) - 音视频处理工具
- [TipTap](https://tiptap.dev/) - 富文本编辑器
