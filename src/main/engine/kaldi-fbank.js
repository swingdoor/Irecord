/**
 * kaldi 兼容 fbank 特征提取(对齐 3D-Speaker / torchaudio.compliance.kaldi.fbank)
 * 参数:num_mel_bins=80, frame_length=25ms, frame_shift=10ms, 16kHz,
 *       povey 窗, dither=0, preemph=0.97, remove_dc_offset, use_power,
 *       snip_edges=True, low=20 high=nyquist, samples 缩放到 ±32768
 * 输入:Float32Array PCM ∈ [-1,1] @16kHz
 * 输出:{ feat: Float32Array (T*80), T } —— 已做 global-mean 归一化
 */
const FFT = require('fft.js');

const SR = 16000;
const FRAME_LEN = 400;   // 25ms
const FRAME_SHIFT = 160; // 10ms
const NUM_MEL = 80;
const NFFT = 512;        // 下一个 2 的幂
const PREEMPH = 0.97;
const LOW_FREQ = 20.0;
const HIGH_FREQ = SR / 2; // nyquist
const EPS = Math.log(1.1920928955078125e-7); // kaldi log energy floor 用 FLT_MIN 近似; 用 std log floor

// povey 窗: (0.5 - 0.5*cos(2πn/(N-1)))^0.85
function poveyWindow(N) {
  const w = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / (N - 1));
    w[n] = Math.pow(h, 0.85);
  }
  return w;
}

function melScale(freq) { return 1127.0 * Math.log(1.0 + freq / 700.0); }
function invMel(mel) { return 700.0 * (Math.exp(mel / 1127.0) - 1.0); }

// kaldi mel 滤波器组:基于 NFFT/2+1 个 bin,80 个三角滤波器
function melBanks() {
  const numFftBins = NFFT / 2 + 1; // 257
  const fftBinWidth = SR / NFFT;
  const melLow = melScale(LOW_FREQ);
  const melHigh = melScale(HIGH_FREQ);
  const melDelta = (melHigh - melLow) / (NUM_MEL + 1);
  const banks = [];
  for (let m = 0; m < NUM_MEL; m++) {
    const leftMel = melLow + m * melDelta;
    const centerMel = melLow + (m + 1) * melDelta;
    const rightMel = melLow + (m + 2) * melDelta;
    const filt = new Float32Array(numFftBins);
    for (let b = 0; b < numFftBins; b++) {
      const freq = fftBinWidth * b;
      const mel = melScale(freq);
      if (mel > leftMel && mel < rightMel) {
        let w;
        if (mel <= centerMel) w = (mel - leftMel) / (centerMel - leftMel);
        else w = (rightMel - mel) / (rightMel - centerMel);
        filt[b] = w;
      }
    }
    banks.push(filt);
  }
  return banks;
}

const WINDOW = poveyWindow(FRAME_LEN);
const MEL = melBanks();

function computeFbank(samples) {
  // 缩放到 ±32768(kaldi normalize_samples 惯例)
  const N = samples.length;
  const numFrames = 1 + Math.floor((N - FRAME_LEN) / FRAME_SHIFT); // snip_edges
  if (numFrames <= 0) return { feat: new Float32Array(0), T: 0 };

  const fft = new FFT(NFFT);
  const complexOut = fft.createComplexArray();
  const realIn = new Float64Array(NFFT);
  const feat = new Float32Array(numFrames * NUM_MEL);

  for (let t = 0; t < numFrames; t++) {
    const start = t * FRAME_SHIFT;
    // 取帧 + 缩放
    const frame = new Float64Array(FRAME_LEN);
    for (let i = 0; i < FRAME_LEN; i++) frame[i] = samples[start + i] * 32768.0;
    // remove_dc_offset: 减帧均值
    let mean = 0; for (let i = 0; i < FRAME_LEN; i++) mean += frame[i];
    mean /= FRAME_LEN;
    for (let i = 0; i < FRAME_LEN; i++) frame[i] -= mean;
    // 预加重 0.97(kaldi: 就地,x[i]-=0.97*x[i-1], i 从大到小, x[0]-=0.97*x[0])
    for (let i = FRAME_LEN - 1; i > 0; i--) frame[i] -= PREEMPH * frame[i - 1];
    frame[0] -= PREEMPH * frame[0];
    // 加窗 + zero pad 到 NFFT
    realIn.fill(0);
    for (let i = 0; i < FRAME_LEN; i++) realIn[i] = frame[i] * WINDOW[i];
    // FFT
    fft.realTransform(complexOut, realIn);
    fft.completeSpectrum(complexOut);
    // power spectrum |X|^2, 前 257 bin
    const numFftBins = NFFT / 2 + 1;
    const power = new Float64Array(numFftBins);
    for (let b = 0; b < numFftBins; b++) {
      const re = complexOut[2 * b], im = complexOut[2 * b + 1];
      power[b] = re * re + im * im;
    }
    // mel 滤波 + log
    for (let m = 0; m < NUM_MEL; m++) {
      const filt = MEL[m];
      let e = 0;
      for (let b = 0; b < numFftBins; b++) e += filt[b] * power[b];
      feat[t * NUM_MEL + m] = Math.log(Math.max(e, 1.1920928955078125e-7));
    }
  }

  // global-mean 归一化:沿时间轴逐 bin 减均值
  for (let m = 0; m < NUM_MEL; m++) {
    let mean = 0;
    for (let t = 0; t < numFrames; t++) mean += feat[t * NUM_MEL + m];
    mean /= numFrames;
    for (let t = 0; t < numFrames; t++) feat[t * NUM_MEL + m] -= mean;
  }

  return { feat, T: numFrames };
}

module.exports = { computeFbank, SR, NUM_MEL };
