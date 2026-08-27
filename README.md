# iRecord 你说我记

本地离线语音识别转写工具，基于 Electron + Sherpa-ONNX。录音或上传音视频，本地转写成文字，再借助大模型整理成结构化知识文档。音频识别全程本地运行不联网；知识整理可选接入云端 LLM。

> 当前版本：v0.9.5 · 平台：Windows 10/11 · macOS (Apple Silicon / arm64)

## 功能特性

### 录音与转写
- 🎙️ 应用内录音独立保存；需要识别时按文件送入统一转写工作流
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

### Agent 集成
- 🔌 可选本地 MCP 2026-07-28 Streamable HTTP 服务，默认关闭且只监听 `127.0.0.1`
- 🔐 开启后显示一个带本地 token 的完整连接地址，可直接复制给 Agent；地址默认持久不变，也可主动刷新
- 🧰 九个安全工具覆盖录音发现、转写任务、模板和知识文档；不开放删除、设置、凭据或任意文件写入

## 系统要求

- Windows 10/11，或 macOS（Apple Silicon / arm64）
- 4GB+ RAM
- 2GB+ 磁盘空间（默认模型约 290MB，启用 Qwen3-ASR 另需约 950MB）
- macOS 下本地编译 `nodejieba` 需要 Xcode Command Line Tools（`xcode-select --install`）

## 快速开始

### 1. 安装依赖

```bash
npm install
```

原生模块说明：
- ASR 和说话人分离通过官方 Sherpa-ONNX 静态 CLI 子进程运行，不再依赖 `sherpa-onnx-node` JS 绑定。
- `nodejieba` 在安装时本地编译（N-API），macOS 需先装好 Xcode Command Line Tools。
- 本地推理运行在独立 CLI 进程中，Electron 主进程只负责调度、日志和结果解析。
- 若安装环境禁用了 npm install scripts（`ignore-scripts=true`），`nodejieba` 将无法编译、Electron 二进制不会下载——需开启脚本或手动补装。
- 国内网络下 Electron 二进制默认从 github.com 下载较慢，本仓库 `.npmrc` 已通过 `electron_mirror` 指向 npmmirror 镜像加速（npm registry 请用各自环境配置）。

### 2. 准备模型文件

默认 ASR 模型（SenseVoice）及辅助模型（VAD、说话人分离）放在 `resources/models/` 目录下：

```
resources/models/
├── sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/   # 默认 ASR，内置
├── sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25/           # 高精度 ASR，可选
├── silero-vad/                                            # 语音活动检测
└── speaker-diarization/                                   # 说话人分离
```

Sherpa-ONNX CLI 运行时放在 `resources/runtimes/sherpa-onnx/<platform-arch>/`：

```
resources/runtimes/sherpa-onnx/
├── darwin-arm64/
│   ├── sherpa-onnx-offline
│   └── sherpa-onnx-offline-speaker-diarization
└── win32-x64/
    ├── sherpa-onnx-offline.exe
    └── sherpa-onnx-offline-speaker-diarization.exe
```

可使用脚本下载：

```bash
bash scripts/download-models.sh
```

Qwen3-ASR 也可在应用「设置 → 模型管理」中按需下载。

### 3. 准备 FFmpeg（音视频统一转 WAV）

应用会把所有导入文件先转换为 16kHz 单声道 PCM WAV，再交给 Sherpa CLI。运行时只需要 `ffmpeg`，不再需要 `ffprobe`。

**Windows：**
1. 访问 https://www.gyan.dev/ffmpeg/builds/
2. 下载 Windows 版本（ffmpeg-release-essentials.zip）
3. 解压后将 `ffmpeg.exe` 复制到 `resources/ffmpeg/` 目录

**macOS（Apple Silicon）：**
1. 通过 Homebrew 安装：`brew install ffmpeg`
2. 将二进制复制到项目内：`cp "$(brew --prefix)/bin/ffmpeg" resources/ffmpeg/`
   （或从 https://evermeet.cx/ffmpeg/ 下载 arm64 静态构建后放入 `resources/ffmpeg/`）

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

本地 Agent 接入见 [docs/MCP服务.md](docs/MCP服务.md)。

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Electron 41 |
| 前端 | React 19 + TypeScript + TailwindCSS 4 + Ant Design 6 |
| 状态管理 | Zustand |
| 富文本编辑 | TipTap 3 |
| 语音识别 | Sherpa-ONNX CLI（SenseVoice / Qwen3-ASR） |
| 说话人分离 | pyannote-segmentation + 3D-Speaker |
| 中文分词 | nodejieba |
| 音频处理 | FFmpeg（固定 WAV 预处理） |
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
│   ├── mcp/              # 本地 MCP 网关、安全边界与工具
│   ├── services/         # 共享应用服务、文件管理
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
npm run test:mcp     # MCP 协议、工具与安全测试
npm run test:mcp:electron # Electron 生命周期与本地 HTTP 冒烟测试
node scripts/test-e2e.js  # 端到端识别测试
```

## 打包

```bash
# Windows
npm run build:win           # 构建 NSIS 安装包
npm run build:win:portable  # 构建免安装版

# macOS (Apple Silicon)
npm run build:mac           # 构建 .dmg / .zip（arm64）
```

产物输出到 `release/<version>/`。

> macOS 提示：`build:mac` 产出未签名应用，自用可直接运行（首次打开需在「系统设置 → 隐私与安全性」放行，或 `xattr -dr com.apple.quarantine <App>`）。对外分发需 Apple Developer 账号做代码签名与公证。

## 限制

- 仅支持 CPU 推理；当前 macOS arm64 官方静态 CLI 不支持 Apple GPU/CoreML 加速
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
