/**
 * High-Speed Real-Time Pitch (F0) & Voicing Detector
 * 
 * Uses Normalized Autocorrelation / YIN sub-sample peak interpolation
 * to accurately determine:
 * - Fundamental frequency (pitch in Hz)
 * - Voiced vs. unvoiced / whisper speech state
 * - Pitch clarity / periodicity score
 * - Musical note equivalent (e.g. C3, A3, D4)
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function freqToNote(freq: number): string {
  if (freq <= 0 || !Number.isFinite(freq)) return '--';
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  const noteName = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${noteName}${octave}`;
}

export class PitchDetector {
  private bufferSize: number;
  private yinBuffer: Float32Array;

  constructor(bufferSize: number = 2048) {
    this.bufferSize = bufferSize;
    this.yinBuffer = new Float32Array(bufferSize / 2);
  }

  /**
   * Estimates pitch F0 from Float32Array or Uint8Array time-domain audio buffer
   */
  public getPitch(
    timeDomainData: Float32Array | Uint8Array,
    sampleRate: number = 48000,
    threshold: number = 0.15
  ): { pitch: number; isVoiced: boolean; clarity: number; note: string } {
    const len = timeDomainData.length;
    const halfLen = Math.floor(len / 2);

    // Convert Uint8Array to normalized Float32 values if needed
    let samples: Float32Array;
    if (timeDomainData instanceof Uint8Array) {
      samples = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        samples[i] = (timeDomainData[i] - 128) / 128.0;
      }
    } else {
      samples = timeDomainData;
    }

    // 1. Calculate RMS Volume
    let sumSq = 0;
    for (let i = 0; i < len; i++) {
      sumSq += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sumSq / len);

    if (rms < 0.015) {
      return { pitch: 0, isVoiced: false, clarity: 0, note: '--' };
    }

    // 2. Compute Difference Function: d_t(tau) = sum (x[j] - x[j+tau])^2
    this.yinBuffer[0] = 1;
    let runningSum = 0;

    // Pitch bounds: Min F0 75 Hz (tauMax), Max F0 500 Hz (tauMin)
    const minPeriod = Math.floor(sampleRate / 500);
    const maxPeriod = Math.min(halfLen - 1, Math.floor(sampleRate / 75));

    for (let tau = 1; tau <= maxPeriod; tau++) {
      let diff = 0;
      for (let i = 0; i < halfLen; i++) {
        const delta = samples[i] - samples[i + tau];
        diff += delta * delta;
      }

      runningSum += diff;
      // Cumulative Mean Normalized Difference Function
      this.yinBuffer[tau] = runningSum === 0 ? 1 : (diff * tau) / runningSum;
    }

    // 3. Absolute Threshold & Local Minimum Search
    let bestTau = -1;
    for (let tau = minPeriod; tau <= maxPeriod; tau++) {
      if (this.yinBuffer[tau] < threshold) {
        while (tau + 1 <= maxPeriod && this.yinBuffer[tau + 1] < this.yinBuffer[tau]) {
          tau++;
        }
        bestTau = tau;
        break;
      }
    }

    // If no tau fell below threshold, find global minimum in reasonable range
    if (bestTau === -1) {
      let minVal = 1.0;
      for (let tau = minPeriod; tau <= maxPeriod; tau++) {
        if (this.yinBuffer[tau] < minVal) {
          minVal = this.yinBuffer[tau];
          bestTau = tau;
        }
      }
      if (minVal > 0.45) {
        // Unvoiced / noise signal
        return { pitch: 0, isVoiced: false, clarity: 1 - minVal, note: '--' };
      }
    }

    // 4. Parabolic Interpolation for exact fractional period
    let interpolatedTau = bestTau;
    if (bestTau > 0 && bestTau < maxPeriod) {
      const s0 = this.yinBuffer[bestTau - 1];
      const s1 = this.yinBuffer[bestTau];
      const s2 = this.yinBuffer[bestTau + 1];
      const bottom = 2 * (2 * s1 - s0 - s2);
      if (Math.abs(bottom) > 1e-6) {
        const delta = (s2 - s0) / bottom;
        interpolatedTau = bestTau + Math.max(-0.5, Math.min(0.5, delta));
      }
    }

    const pitch = sampleRate / interpolatedTau;
    const clarity = Math.max(0, Math.min(1, 1 - (this.yinBuffer[bestTau] || 0)));
    const isVoiced = clarity > 0.6 && pitch >= 75 && pitch <= 500;

    return {
      pitch: isVoiced ? Math.round(pitch) : 0,
      isVoiced,
      clarity,
      note: isVoiced ? freqToNote(pitch) : '--'
    };
  }
}
