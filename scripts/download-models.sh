#!/bin/bash
# 下载 Qwen3-ASR-0.6B 模型文件（sherpa-onnx 格式）
# 模型来源: https://k2-fsa.github.io/sherpa/onnx/qwen3-asr/pretrained.html

set -e

MODELS_DIR="$(cd "$(dirname "$0")/.." && pwd)/resources/models"
MODEL_NAME="sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25"
DOWNLOAD_URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${MODEL_NAME}.tar.bz2"

echo "=== Qwen3-ASR-0.6B 模型下载脚本 ==="
echo ""
echo "模型目录: ${MODELS_DIR}"
echo "模型名称: ${MODEL_NAME}"
echo ""

# 创建目录
mkdir -p "${MODELS_DIR}"

# 检查是否已下载
if [ -d "${MODELS_DIR}/${MODEL_NAME}" ]; then
  echo "模型已存在，跳过下载。"
  echo "如需重新下载，请先删除: ${MODELS_DIR}/${MODEL_NAME}"
  exit 0
fi

echo "正在下载模型（约 600MB）..."
echo "下载地址: ${DOWNLOAD_URL}"
echo ""

cd "${MODELS_DIR}"

# 下载
if command -v wget &> /dev/null; then
  wget -c "${DOWNLOAD_URL}"
elif command -v curl &> /dev/null; then
  curl -L -O -C - "${DOWNLOAD_URL}"
else
  echo "错误: 需要 wget 或 curl"
  exit 1
fi

# 解压
echo "正在解压..."
tar xvf "${MODEL_NAME}.tar.bz2"
rm -f "${MODEL_NAME}.tar.bz2"

echo ""
echo "=== 下载完成 ==="
echo "模型路径: ${MODELS_DIR}/${MODEL_NAME}"
