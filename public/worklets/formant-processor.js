class FormantProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;

    // Very basic smoothing for demonstration purposes
    this.f1 = 500;
    this.f2 = 1500;
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

    // Only process if someone is actually speaking (noise gate)
    if (avgVolume > 0.02) {
      // Very crude zero-crossing based estimation for demonstration
      // In a real production app, this would use an LPC algorithm
      let zeroCrossings = 0;
      for (let i = 1; i < this.bufferSize; i++) {
        if (
          (this.buffer[i] >= 0 && this.buffer[i - 1] < 0) ||
          (this.buffer[i] < 0 && this.buffer[i - 1] >= 0)
        ) {
          zeroCrossings++;
        }
      }

      // Sample rate is typically 48000 or 44100 in AudioWorklet
      // This is a placeholder for actual F1/F2 extraction logic
      const estimatedFreq = (zeroCrossings * sampleRate) / (2 * this.bufferSize);

      // Rough heuristic mapping for visual testing
      let newF1 = 500;
      let newF2 = 1500;

      if (estimatedFreq > 2000) { // Sibilant /s/, /sh/
        newF1 = 200;
        newF2 = 2500;
      } else if (estimatedFreq < 500) { // Low vowels /u/
        newF1 = 300;
        newF2 = 800;
      } else if (estimatedFreq > 1000 && estimatedFreq < 2000) { // Mid/High vowels
         newF1 = 700;
         newF2 = 1600;
      }

      // Smooth it
      this.f1 = this.f1 * 0.8 + newF1 * 0.2;
      this.f2 = this.f2 * 0.8 + newF2 * 0.2;

      this.port.postMessage({
        isSpeaking: true,
        f1: this.f1,
        f2: this.f2,
        volume: avgVolume
      });
    } else {
      this.port.postMessage({
        isSpeaking: false,
        volume: avgVolume
      });
    }
  }
}

registerProcessor('formant-processor', FormantProcessor);
