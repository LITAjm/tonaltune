class FormantProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048; // Must be power of 2 for potential FFT if needed, good for autocorrelation
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;

    // Formant state
    this.f1 = 500;
    this.f2 = 1500;

    // Autocorrelation/LPC properties
    // Number of LPC coefficients (poles). Typically (sampleRate / 1000) + 2
    // For 48kHz, this would be ~50. For performance in JS worklet, we keep it lower to find broad peaks.
    this.lpcOrder = 12;
    this.autocorr = new Float32Array(this.lpcOrder + 1);
    this.lpcCoeffs = new Float32Array(this.lpcOrder);
  }

  // Pre-emphasis filter to boost high frequencies (lip radiation characteristic)
  preEmphasis(buffer) {
    const alpha = 0.95;
    const preEmphasized = new Float32Array(buffer.length);
    preEmphasized[0] = buffer[0];
    for (let i = 1; i < buffer.length; i++) {
      preEmphasized[i] = buffer[i] - alpha * buffer[i - 1];
    }
    return preEmphasized;
  }

  // Calculate autocorrelation of the signal
  computeAutocorrelation(buffer) {
    for (let lag = 0; lag <= this.lpcOrder; lag++) {
      let sum = 0;
      for (let i = 0; i < buffer.length - lag; i++) {
        sum += buffer[i] * buffer[i + lag];
      }
      this.autocorr[lag] = sum;
    }
  }

  // Levinson-Durbin recursion to find LPC coefficients from autocorrelation
  levinsonDurbin() {
    let err = this.autocorr[0];
    const k = new Float32Array(this.lpcOrder);
    const a = new Float32Array(this.lpcOrder);

    if (err === 0) return a; // Silence

    for (let i = 0; i < this.lpcOrder; i++) {
      let sum = 0;
      for (let j = 0; j < i; j++) {
        sum += a[j] * this.autocorr[i - j];
      }

      k[i] = (this.autocorr[i + 1] - sum) / err;
      a[i] = k[i];

      // We must not mutate 'a' in-place during the inner loop since
      // we need the old values for a[i - 1 - j]
      const oldA = new Float32Array(a);
      for (let j = 0; j < i; j++) {
        a[j] = oldA[j] - k[i] * oldA[i - 1 - j];
      }

      err = err * (1 - k[i] * k[i]);
    }

    return a;
  }

  // Evaluate the LPC polynomial on the unit circle to find spectral envelope peaks
  // This is a rough estimation of the roots (formants).
  // A true implementation roots the polynomial, but peak-picking the spectrum is faster in JS.
  estimateFormantsFromLPC(a) {
    const spectrumSize = 256;
    const spectrum = new Float32Array(spectrumSize);

    // Evaluate frequency response from 0 to Nyquist
    for (let w = 0; w < spectrumSize; w++) {
      const omega = (Math.PI * w) / spectrumSize;
      let real = 1.0;
      let imag = 0.0;

      for (let k = 0; k < this.lpcOrder; k++) {
        real -= a[k] * Math.cos(omega * (k + 1));
        imag -= a[k] * Math.sin(omega * (k + 1));
      }

      // Magnitude squared of denominator
      const magSq = real * real + imag * imag;
      spectrum[w] = 1.0 / magSq; // Power spectrum
    }

    // Peak picking
    const peaks = [];
    for (let i = 1; i < spectrumSize - 1; i++) {
      if (spectrum[i] > spectrum[i - 1] && spectrum[i] > spectrum[i + 1]) {
        // Convert index to frequency
        const freq = (i / spectrumSize) * (sampleRate / 2);
        // Typical formant range filter (F1 usually > 200, F2 usually < 3500)
        if (freq > 200 && freq < 3500) {
           peaks.push({ freq: freq, power: spectrum[i] });
        }
      }
    }

    // Sort peaks by frequency
    peaks.sort((a, b) => a.freq - b.freq);

    return peaks;
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
    let sum = 0;
    for (let i = 0; i < this.bufferSize; i++) {
      sum += Math.abs(this.buffer[i]);
    }
    const avgVolume = sum / this.bufferSize;

    // Threshold to detect active voiced speech vs silence/unvoiced
    const threshold = 0.015;

    if (avgVolume > threshold) {
      // 1. Pre-emphasis
      const preEmpBuffer = this.preEmphasis(this.buffer);

      // 2. Windowing (Hamming)
      for (let i = 0; i < this.bufferSize; i++) {
        preEmpBuffer[i] *= 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (this.bufferSize - 1));
      }

      // 3. Autocorrelation
      this.computeAutocorrelation(preEmpBuffer);

      // 4. Levinson-Durbin LPC
      const lpcCoeffs = this.levinsonDurbin();

      // 5. Formant Estimation
      const peaks = this.estimateFormantsFromLPC(lpcCoeffs);

      let newF1 = this.f1;
      let newF2 = this.f2;

      // Map the found peaks to F1 and F2
      if (peaks.length >= 2) {
        newF1 = peaks[0].freq;

        // Sometimes F1 and F2 merge, or false peaks appear.
        // A simple heuristic for F2: it should be higher than F1, usually > 800Hz.
        let f2Candidate = peaks[1].freq;
        if (f2Candidate < 800 && peaks.length > 2) {
            f2Candidate = peaks[2].freq;
        }
        newF2 = f2Candidate;
      } else if (peaks.length === 1) {
        // Only one strong peak found (e.g. back vowel where F1/F2 merge)
        newF1 = peaks[0].freq;
        // Keep F2 near F1 for back vowels
        newF2 = Math.max(800, newF1 * 1.5);
      }

      // Clamp to reasonable human bounds
      newF1 = Math.max(200, Math.min(1000, newF1));
      newF2 = Math.max(600, Math.min(2500, newF2));

      // Smooth it to prevent jitter
      this.f1 = this.f1 * 0.85 + newF1 * 0.15;
      this.f2 = this.f2 * 0.85 + newF2 * 0.15;

      this.port.postMessage({
        isSpeaking: true,
        f1: this.f1,
        f2: this.f2,
        volume: avgVolume
      });
    } else {
      // Drift back to a neutral resting state (/ə/ neutral schwa)
      this.f1 = this.f1 * 0.9 + 500 * 0.1;
      this.f2 = this.f2 * 0.9 + 1500 * 0.1;

      this.port.postMessage({
        isSpeaking: false,
        f1: this.f1,
        f2: this.f2,
        volume: avgVolume
      });
    }
  }
}

registerProcessor('formant-processor', FormantProcessor);
