/**
 * High-Precision Real-Time Formant Extraction AudioWorklet
 * 
 * Performs:
 * 1. Decimation to speech bandwidth (10-12 kHz)
 * 2. High-pass pre-emphasis filter
 * 3. Hamming windowing
 * 4. Numerically-stable Levinson-Durbin Linear Predictive Coding (LPC)
 * 5. High-resolution spectral envelope peak picking with parabolic interpolation
 */

class FormantProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Raw input buffer
    this.bufferSize = 2048;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;

    // Smoothed formant state (neutral schwa /ə/ default)
    this.f1 = 500;
    this.f2 = 1500;
    this.f3 = 2500;

    // LPC settings for downsampled signal
    this.decimationFactor = 4; // 48kHz / 4 = 12kHz speech bandwidth
    this.lpcOrder = 12;        // 12 poles at 12kHz = 6 complex formant pairs
    this.prevSample = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channel = input[0];
    if (!channel) return true;

    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.bufferIndex++] = channel[i];

      if (this.bufferIndex >= this.bufferSize) {
        this.analyzeBuffer();
        this.bufferIndex = 0;
      }
    }

    return true;
  }

  analyzeBuffer() {
    // 1. Calculate RMS volume & energy
    let sumSq = 0;
    for (let i = 0; i < this.bufferSize; i++) {
      sumSq += this.buffer[i] * this.buffer[i];
    }
    const rms = Math.sqrt(sumSq / this.bufferSize);
    const volumeThreshold = 0.012; // Energy gate for voice activity

    if (rms < volumeThreshold) {
      // User is silent or below threshold: drift smoothly to neutral schwa
      this.f1 = this.f1 * 0.92 + 500 * 0.08;
      this.f2 = this.f2 * 0.92 + 1500 * 0.08;
      this.f3 = this.f3 * 0.92 + 2500 * 0.08;

      this.port.postMessage({
        isSpeaking: false,
        f1: Math.round(this.f1),
        f2: Math.round(this.f2),
        f3: Math.round(this.f3),
        volume: rms
      });
      return;
    }

    // 2. Downsample (Decimate by 4) to focus LPC on 0 - 6000 Hz vocal range
    const effectiveSampleRate = (typeof sampleRate !== 'undefined' ? sampleRate : 48000) / this.decimationFactor;
    const downsampledLength = Math.floor(this.bufferSize / this.decimationFactor);
    const downsampled = new Float32Array(downsampledLength);

    for (let i = 0; i < downsampledLength; i++) {
      // Simple 4-point average filter before decimation
      let avg = 0;
      const base = i * this.decimationFactor;
      for (let k = 0; k < this.decimationFactor; k++) {
        avg += this.buffer[base + k];
      }
      downsampled[i] = avg / this.decimationFactor;
    }

    // 3. Pre-emphasis filter: H(z) = 1 - 0.96 * z^(-1)
    const preEmphasized = new Float32Array(downsampledLength);
    preEmphasized[0] = downsampled[0] - 0.96 * this.prevSample;
    for (let i = 1; i < downsampledLength; i++) {
      preEmphasized[i] = downsampled[i] - 0.96 * downsampled[i - 1];
    }
    this.prevSample = downsampled[downsampledLength - 1];

    // 4. Hamming Window
    for (let i = 0; i < downsampledLength; i++) {
      preEmphasized[i] *= 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (downsampledLength - 1));
    }

    // 5. Autocorrelation
    const p = this.lpcOrder;
    const r = new Float32Array(p + 1);
    for (let lag = 0; lag <= p; lag++) {
      let sum = 0;
      for (let i = 0; i < downsampledLength - lag; i++) {
        sum += preEmphasized[i] * preEmphasized[i + lag];
      }
      r[lag] = sum;
    }

    if (r[0] <= 1e-7 || !Number.isFinite(r[0])) {
      return;
    }

    // 6. Numerically Stable Levinson-Durbin Recursion
    let err = r[0];
    const a = new Float32Array(p);
    let stable = true;

    for (let i = 0; i < p; i++) {
      let sum = 0;
      for (let j = 0; j < i; j++) {
        sum += a[j] * r[i - j];
      }

      const ki = (r[i + 1] - sum) / err;
      if (!Number.isFinite(ki) || Math.abs(ki) >= 0.999) {
        stable = false;
        break;
      }

      a[i] = ki;
      const oldA = new Float32Array(a);
      for (let j = 0; j < i; j++) {
        a[j] = oldA[j] - ki * oldA[i - 1 - j];
      }

      err *= (1.0 - ki * ki);
      if (err <= 1e-8 || !Number.isFinite(err)) {
        stable = false;
        break;
      }
    }

    if (!stable) {
      return;
    }

    // 7. Spectral Envelope Evaluation & High-Resolution Peak Picking
    // Evaluate LPC power spectrum from 200 Hz to 3500 Hz
    const numEvalPoints = 256;
    const minFreq = 180;
    const maxFreq = 3500;
    const freqStep = (maxFreq - minFreq) / (numEvalPoints - 1);
    const powerSpectrum = new Float32Array(numEvalPoints);

    for (let idx = 0; idx < numEvalPoints; idx++) {
      const freq = minFreq + idx * freqStep;
      const omega = (2 * Math.PI * freq) / effectiveSampleRate;

      let real = 1.0;
      let imag = 0.0;

      for (let k = 0; k < p; k++) {
        const angle = omega * (k + 1);
        real -= a[k] * Math.cos(angle);
        imag -= a[k] * Math.sin(angle);
      }

      const magSq = real * real + imag * imag;
      powerSpectrum[idx] = 1.0 / Math.max(1e-9, magSq);
    }

    // 8. Find Local Spectral Maxima with Parabolic Interpolation
    const peaks = [];
    for (let i = 1; i < numEvalPoints - 1; i++) {
      const prev = powerSpectrum[i - 1];
      const curr = powerSpectrum[i];
      const next = powerSpectrum[i + 1];

      if (curr > prev && curr > next && curr > 1.2) {
        // Parabolic peak interpolation for sub-bin precision
        const delta = (next - prev) / (2 * (2 * curr - prev - next) + 1e-9);
        const interpolatedIdx = i + Math.max(-0.5, Math.min(0.5, delta));
        const peakFreq = minFreq + interpolatedIdx * freqStep;

        peaks.push({ freq: peakFreq, power: curr });
      }
    }

    // 9. Assign Formants F1, F2, F3
    let rawF1 = this.f1;
    let rawF2 = this.f2;
    let rawF3 = this.f3;

    // Filter peaks into plausible formant ranges
    const f1Candidates = peaks.filter(pk => pk.freq >= 200 && pk.freq <= 1100);
    const f2Candidates = peaks.filter(pk => pk.freq >= 600 && pk.freq <= 2800);
    const f3Candidates = peaks.filter(pk => pk.freq >= 1800 && pk.freq <= 3600);

    if (f1Candidates.length > 0) {
      // Pick highest energy in F1 band
      f1Candidates.sort((a, b) => b.power - a.power);
      rawF1 = f1Candidates[0].freq;
    }

    if (f2Candidates.length > 0) {
      // Pick best F2 candidate that is distinct from F1
      const validF2 = f2Candidates.filter(pk => pk.freq > rawF1 + 180);
      if (validF2.length > 0) {
        validF2.sort((a, b) => b.power - a.power);
        rawF2 = validF2[0].freq;
      }
    }

    if (f3Candidates.length > 0) {
      const validF3 = f3Candidates.filter(pk => pk.freq > rawF2 + 250);
      if (validF3.length > 0) {
        validF3.sort((a, b) => b.power - a.power);
        rawF3 = validF3[0].freq;
      }
    }

    // Clamp to human anatomical limits
    rawF1 = Math.max(200, Math.min(1000, rawF1));
    rawF2 = Math.max(600, Math.min(2600, rawF2));
    rawF3 = Math.max(1800, Math.min(3500, rawF3));

    // Dynamic smoothing: fast response when moving, stable when holding
    const alpha = 0.35; // 35% new, 65% previous
    this.f1 = this.f1 * (1 - alpha) + rawF1 * alpha;
    this.f2 = this.f2 * (1 - alpha) + rawF2 * alpha;
    this.f3 = this.f3 * (1 - alpha) + rawF3 * alpha;

    this.port.postMessage({
      isSpeaking: true,
      f1: Math.round(this.f1),
      f2: Math.round(this.f2),
      f3: Math.round(this.f3),
      volume: rms
    });
  }
}

registerProcessor('formant-processor', FormantProcessor);
