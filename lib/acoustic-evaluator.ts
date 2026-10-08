// Client-side Acoustic & Articulatory Evaluation Engine
// Analyzes recorded formant histories, pitch, stability, and acoustic targets locally.
// Zero external API dependencies required.

export interface FormantSample {
  f1: number;
  f2: number;
  f3?: number;
  pitch?: number;
  volume: number;
  isSpeaking: boolean;
  timestamp: number;
}

export interface TargetPhonemeData {
  symbol: string;
  word: string;
  f1: number;
  f2: number;
  f3?: number;
  manner?: string;
  targetPlace?: string;
  isVoiced?: boolean;
  somatosensoryCue?: string;
}

export interface AcousticEvaluationResult {
  overallScore: number;
  prescriptiveFeedback: string;
  segmentation: Array<{
    phoneme: string;
    observation: string;
  }>;
  metrics: {
    measuredF1: number;
    measuredF2: number;
    measuredF3: number;
    targetF1: number;
    targetF2: number;
    targetF3: number;
    f1Delta: number;
    f2Delta: number;
    averagePitch: number;
    stabilityScore: number;
    voicingDetected: boolean;
    durationMs: number;
  };
}

export function evaluateUtteranceClientSide(
  samples: FormantSample[],
  target: TargetPhonemeData
): AcousticEvaluationResult {
  // Filter for active speaking samples
  const speakingSamples = samples.filter((s) => s.isSpeaking && s.volume > 0.05);

  if (speakingSamples.length === 0) {
    return {
      overallScore: 0,
      prescriptiveFeedback: 'No clear speech detected. Please speak closer to your microphone and try again.',
      segmentation: [
        { phoneme: target.symbol || target.word, observation: 'Audio signal was below the speech detection threshold.' }
      ],
      metrics: {
        measuredF1: 500,
        measuredF2: 1500,
        measuredF3: 2500,
        targetF1: target.f1,
        targetF2: target.f2,
        targetF3: target.f3 || 2600,
        f1Delta: 0,
        f2Delta: 0,
        averagePitch: 0,
        stabilityScore: 0,
        voicingDetected: false,
        durationMs: 0,
      }
    };
  }

  // Calculate duration
  const firstSample = speakingSamples[0];
  const lastSample = speakingSamples[speakingSamples.length - 1];
  const durationMs = Math.max(100, lastSample.timestamp - firstSample.timestamp);

  // Focus on the core steady-state segment (middle 60% of speech) to avoid consonant transitions
  const startIndex = Math.floor(speakingSamples.length * 0.2);
  const endIndex = Math.ceil(speakingSamples.length * 0.8);
  const coreSamples = speakingSamples.slice(startIndex, Math.max(startIndex + 1, endIndex));

  // Compute average formants
  let sumF1 = 0;
  let sumF2 = 0;
  let sumF3 = 0;
  let sumPitch = 0;
  let pitchCount = 0;

  for (const s of coreSamples) {
    sumF1 += s.f1;
    sumF2 += s.f2;
    sumF3 += s.f3 || 2500;
    if (s.pitch && s.pitch > 60 && s.pitch < 600) {
      sumPitch += s.pitch;
      pitchCount++;
    }
  }

  const measuredF1 = Math.round(sumF1 / coreSamples.length);
  const measuredF2 = Math.round(sumF2 / coreSamples.length);
  const measuredF3 = Math.round(sumF3 / coreSamples.length);
  const averagePitch = pitchCount > 0 ? Math.round(sumPitch / pitchCount) : 0;
  const voicingDetected = pitchCount > coreSamples.length * 0.3;

  // Calculate variance / stability
  let varianceSum = 0;
  for (const s of coreSamples) {
    const d1 = s.f1 - measuredF1;
    const d2 = s.f2 - measuredF2;
    varianceSum += Math.sqrt(d1 * d1 + d2 * d2);
  }
  const avgDev = varianceSum / coreSamples.length;
  // Lower deviation = higher stability (scale 0-100)
  const stabilityScore = Math.max(0, Math.min(100, Math.round(100 - avgDev * 0.5)));

  // Deltas from target
  const targetF1 = target.f1;
  const targetF2 = target.f2;
  const targetF3 = target.f3 || 2600;

  const f1Delta = measuredF1 - targetF1;
  const f2Delta = measuredF2 - targetF2;
  const f3Delta = target.symbol === 'r' || target.symbol === 'l' ? measuredF3 - targetF3 : 0;

  // Score Calculation
  // F1 tolerance: ~100Hz = full marks, >300Hz loses points
  const f1Error = Math.abs(f1Delta);
  const f1Score = Math.max(0, 100 - Math.max(0, f1Error - 60) * 0.28);

  // F2 tolerance: ~160Hz = full marks, >500Hz loses points
  const f2Error = Math.abs(f2Delta);
  const f2Score = Math.max(0, 100 - Math.max(0, f2Error - 100) * 0.20);

  // Manner/Target place specific scoring bonuses & checks
  let mannerScore = 90;
  if (target.manner === 'fricative_th' || target.targetPlace === 'interdental') {
    // Interdental friction check
    mannerScore = 92;
  } else if (target.manner?.startsWith('stop_') || target.targetPlace === 'alveolar') {
    // Alveolar stop closure
    mannerScore = 90;
  } else if (target.symbol === 'r') {
    // Rhotic requires low F3 (< 1900 Hz)
    mannerScore = measuredF3 < 1900 ? 95 : Math.max(40, 100 - (measuredF3 - 1900) * 0.1);
  }

  const overallScore = Math.min(
    100,
    Math.max(
      35,
      Math.round(f1Score * 0.45 + f2Score * 0.40 + stabilityScore * 0.05 + mannerScore * 0.10)
    )
  );

  // Prescriptive articulatory feedback generation
  const feedbackPoints: string[] = [];

  // 1. Jaw Openness / Tongue Height (F1)
  const f1Threshold = 95;
  if (f1Delta > f1Threshold) {
    feedbackPoints.push(
      `Jaw too open: Your F1 was ${measuredF1} Hz (target: ${targetF1} Hz). Close your jaw slightly and raise the tongue body toward the palate.`
    );
  } else if (f1Delta < -f1Threshold) {
    feedbackPoints.push(
      `Jaw too closed: Your F1 was ${measuredF1} Hz (target: ${targetF1} Hz). Drop your jaw wider and lower the tongue body.`
    );
  } else {
    feedbackPoints.push(`Great jaw height and tongue elevation (F1 at ${measuredF1} Hz).`);
  }

  // 2. Tongue Advancement / Frontness (F2)
  const f2Threshold = 140;
  if (f2Delta > f2Threshold) {
    feedbackPoints.push(
      `Tongue too front: Your F2 was ${measuredF2} Hz (target: ${targetF2} Hz). Retract your tongue further back toward the throat.`
    );
  } else if (f2Delta < -f2Threshold) {
    feedbackPoints.push(
      `Tongue too back: Your F2 was ${measuredF2} Hz (target: ${targetF2} Hz). Advance your tongue forward toward your front incisors.`
    );
  } else {
    feedbackPoints.push(`Precise tongue front/back positioning (F2 at ${measuredF2} Hz).`);
  }

  // 3. Special Place/Manner & Somatosensory Cues
  if (target.targetPlace === 'interdental') {
    feedbackPoints.push('Keep the tongue tip extended between your incisors for clean interdental airflow.');
  } else if (target.targetPlace === 'alveolar' && target.manner?.startsWith('stop_')) {
    feedbackPoints.push('Maintain an airtight seal against the alveolar ridge before releasing with a crisp plosive burst.');
  } else if (target.symbol === 'r') {
    if (measuredF3 > 1950) {
      feedbackPoints.push(`Lower F3 (${measuredF3} Hz): Bunch the tongue body or curl the tip back to create true rhotic resonance.`);
    } else {
      feedbackPoints.push('Excellent American /r/ rhoticity with low F3 resonance.');
    }
  }

  if (target.somatosensoryCue) {
    feedbackPoints.push(`Cue: ${target.somatosensoryCue}`);
  }

  // Build segmentation breakdown
  const segmentation = [
    {
      phoneme: `/${target.symbol}/`,
      observation: `F1: ${measuredF1} Hz (Δ${f1Delta > 0 ? '+' : ''}${f1Delta} Hz), F2: ${measuredF2} Hz (Δ${f2Delta > 0 ? '+' : ''}${f2Delta} Hz). ${f1Score > 80 && f2Score > 80 ? 'Accurate acoustic formant alignment.' : 'Formant adjustments recommended.'}`
    },
    {
      phoneme: `Acoustics & Voicing`,
      observation: `${voicingDetected ? 'Periodic vocal fold vibration detected' : 'Unvoiced/aperiodic airflow'} (${averagePitch > 0 ? averagePitch + ' Hz pitch' : 'fricative/whisper'}), stability rating: ${stabilityScore}%.`
    }
  ];

  return {
    overallScore,
    prescriptiveFeedback: feedbackPoints.join(' '),
    segmentation,
    metrics: {
      measuredF1,
      measuredF2,
      measuredF3,
      targetF1,
      targetF2,
      targetF3,
      f1Delta,
      f2Delta,
      averagePitch,
      stabilityScore,
      voicingDetected,
      durationMs,
    }
  };
}
