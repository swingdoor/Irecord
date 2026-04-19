const { app } = require('electron');
app.whenReady().then(() => {
  try {
    const sherpa = require('sherpa-onnx-node');
    const path = require('path');
    const modelDir = path.resolve('resources/models/sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25');

    console.log('[test] Loading model...');
    const r = new sherpa.OfflineRecognizer({
      modelConfig: {
        qwen3Asr: {
          convFrontend: path.join(modelDir, 'conv_frontend.onnx'),
          encoder: path.join(modelDir, 'encoder.int8.onnx'),
          decoder: path.join(modelDir, 'decoder.int8.onnx'),
          tokenizer: path.join(modelDir, 'tokenizer'),
          maxTotalLen: 4096, maxNewTokens: 1024,
        },
        tokens: '', numThreads: 2, provider: 'cpu', debug: 0,
      },
      decodingMethod: 'greedy_search',
    });
    console.log('[test] Model loaded OK');

    const wave = sherpa.readWave(path.join(modelDir, 'test_wavs', 'ja1.wav'));
    const stream = r.createStream();
    stream.acceptWaveform({sampleRate: wave.sampleRate, samples: wave.samples});
    r.decode(stream);
    const result = r.getResult(stream);
    console.log('[test] Result:', result.text);
    console.log('[test] SUCCESS');
  } catch(e) {
    console.error('[test] FAILED:', e.message);
  }
  app.quit();
});
