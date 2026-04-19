# 语音转写助手 (IRecord)

本地离线语音识别转写工具，基于 Electron + Qwen3-ASR-0.6B 模型。

## 功能特性

- ✅ 完全本地运行，无需联网，保护隐私
- ✅ 支持多种音频格式：MP3, WAV, FLAC, AAC, M4A, OGG
- ✅ 支持视频文件：MP4, AVI, MKV, MOV, FLV（自动提取音轨）
- ✅ 多语言识别：中文、英文、粤语、日语等
- ✅ 高精度识别：基于 Qwen3-ASR-0.6B INT8 量化模型
- ✅ 快速处理：RTF < 0.3（比实时快 3 倍以上）
- ✅ 词级时间戳：精确到每个词的时间位置
- ✅ 导出功能：支持导出 TXT 文件（可选时间戳）

## 系统要求

- Windows 10/11
- 4GB+ RAM
- 2GB+ 磁盘空间（模型文件约 950MB）

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 下载模型文件

模型文件已包含在 `resources/models/sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25/` 目录中。

如需重新下载，参考 [resources/DOWNLOAD.md](resources/DOWNLOAD.md)。

### 3. 下载 FFmpeg（可选）

如需处理视频文件或非标准音频格式，需要下载 FFmpeg：

1. 访问 https://www.gyan.dev/ffmpeg/builds/
2. 下载 Windows 版本（ffmpeg-release-essentials.zip）
3. 解压后将 `ffmpeg.exe` 复制到 `resources/ffmpeg/` 目录

### 4. 运行应用

```bash
npm run dev
```

### 5. 测试识别

```bash
node scripts/test-e2e.js
```

## 使用说明

1. **上传文件**：拖放音频/视频文件到上传区域，或点击选择文件
2. **开始识别**：点击"开始识别"按钮
3. **查看结果**：识别完成后自动跳转到结果页
4. **导出文本**：点击"导出 TXT"保存转写结果

## 技术栈

- **前端**：React 19 + TypeScript + TailwindCSS
- **桌面框架**：Electron 41
- **语音识别**：Sherpa-ONNX + Qwen3-ASR-0.6B
- **音频处理**：FFmpeg
- **状态管理**：Zustand

## 性能指标

基于测试音频的实际表现：

| 语言 | 时长 | 识别耗时 | RTF | 准确率 |
|------|------|----------|-----|--------|
| 中文 | 20.8s | 5.4s | 0.26 | 高 |
| 英文 | 88.2s | 59.2s | 0.67 | 高 |
| 粤语 | 16.4s | 4.6s | 0.28 | 高 |
| 日语 | 5.1s | 1.2s | 0.24 | 高 |

*RTF (Real-Time Factor): 识别耗时 / 音频时长，越小越快*

## 限制

- 单次处理音频时长限制：10 分钟
- 仅支持 CPU 推理（暂不支持 GPU 加速）
- 模型文件较大（~950MB），首次加载需 3-5 秒

## 开发

```bash
# 开发模式
npm run dev

# 类型检查
npm run typecheck

# 构建
npm run build
```

## 许可证

MIT

## 致谢

- [Qwen3-ASR](https://github.com/QwenLM/Qwen3-ASR) - 阿里云通义千问语音识别模型
- [Sherpa-ONNX](https://github.com/k2-fsa/sherpa-onnx) - 高性能语音识别推理框架
- [FFmpeg](https://ffmpeg.org/) - 音视频处理工具
