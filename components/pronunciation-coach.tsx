'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, Settings2, RefreshCw, Volume2, Sparkles, Activity, ChevronDown, ChevronUp, CheckCircle2, RotateCcw, Target, Monitor, Radio, UploadCloud, FileAudio, Headphones } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { VocalTract, ArticulatoryPlace } from './vocal-tract';
import { VocalTract2D } from './vocal-tract-2d';
import { WaveformVisualizer } from './waveform-visualizer';
import { playNativeSpeech } from '@/lib/formant-synth';
import { evaluateUtteranceClientSide, FormantSample } from '@/lib/acoustic-evaluator';

export interface PhonemeTarget {
  symbol: string;
  word: string;
  f1: number;
  f2: number;
  f3?: number;
  manner?: 'vowel' | 'fricative_s' | 'fricative_th' | 'fricative_sh' | 'stop_t' | 'stop_d' | 'stop_k';
  targetPlace?: ArticulatoryPlace;
  isVoiced?: boolean;
  glideTo?: { f1: number; f2: number; f3?: number };
  description: string;
  somatosensoryCue: string;
}

export interface MinimalPairGroup {
  id: string;
  category: string;
  label: string;
  phonemes: PhonemeTarget[];
}

export const MINIMAL_PAIRS: MinimalPairGroup[] = [
  // 1. DENTAL FRICATIVES (The Big Ones: /θ/ and /ð/)
  {
    id: 'th-t',
    category: 'Dental Fricative vs. Stop Substitution',
    label: '/θ/ vs /t/ (thought vs taught)',
    phonemes: [
      {
        symbol: 'θ',
        word: 'thought',
        f1: 380,
        f2: 1550,
        f3: 2600,
        manner: 'fricative_th',
        targetPlace: 'interdental',
        isVoiced: false,
        description: 'Voiceless interdental fricative. Tongue tip protrudes between teeth releasing soft friction.',
        somatosensoryCue: 'Place the tip of your tongue visibly between your front teeth. Do NOT stop the air—let it hiss continuously.'
      },
      {
        symbol: 't',
        word: 'taught',
        f1: 380,
        f2: 1550,
        f3: 2600,
        manner: 'stop_t',
        targetPlace: 'alveolar',
        isVoiced: false,
        description: 'Voiceless alveolar stop. Tongue tip makes an airtight seal against the upper alveolar ridge, then bursts.',
        somatosensoryCue: 'Tap the tip of your tongue firmly against the bumpy ridge behind your upper front teeth and release with a sharp pop.'
      },
    ]
  },
  {
    id: 'dh-d',
    category: 'Voiced Dental Fricative vs. Stop',
    label: '/ð/ vs /d/ (they vs day)',
    phonemes: [
      {
        symbol: 'ð',
        word: 'they',
        f1: 380,
        f2: 1550,
        f3: 2600,
        manner: 'fricative_th',
        targetPlace: 'interdental',
        isVoiced: true,
        description: 'Voiced interdental fricative. Tongue tip between teeth with active vocal cord buzzing.',
        somatosensoryCue: 'Place your tongue tip between your teeth and hum your vocal cords. You should feel your teeth and tongue buzz.'
      },
      {
        symbol: 'd',
        word: 'day',
        f1: 380,
        f2: 1550,
        f3: 2600,
        manner: 'stop_d',
        targetPlace: 'alveolar',
        isVoiced: true,
        description: 'Voiced alveolar stop. Tongue tip firmly seals alveolar ridge before voiced explosive release.',
        somatosensoryCue: 'Press tongue tip firmly behind upper teeth, build pressure with voice humming, then release.'
      },
    ]
  },
  {
    id: 'th-s',
    category: 'Dental Fricative vs. Sibilant',
    label: '/θ/ vs /s/ (think vs sink)',
    phonemes: [
      {
        symbol: 'θ',
        word: 'think',
        f1: 380,
        f2: 1550,
        f3: 2600,
        manner: 'fricative_th',
        targetPlace: 'interdental',
        isVoiced: false,
        description: 'Voiceless interdental fricative. Flat tongue tip rests between teeth.',
        somatosensoryCue: 'Keep the tongue tip flat between upper and lower incisors. Do not pull back into an S-groove.'
      },
      {
        symbol: 's',
        word: 'sink',
        f1: 380,
        f2: 1550,
        f3: 2600,
        manner: 'fricative_s',
        targetPlace: 'alveolar',
        isVoiced: false,
        description: 'Voiceless alveolar sibilant. Narrow central groove behind upper teeth creating high-frequency hiss (>4.5kHz).',
        somatosensoryCue: 'Pull your tongue tip inside behind your upper teeth and shoot a laser-focused stream of cold air.'
      },
    ]
  },

  // 2. PAST TENSE REGULAR "-ED" ENDINGS
  {
    id: 'ed-endings',
    category: 'Past Tense "-ed" Articulation Rules',
    label: '-ed: /t/ (walked) vs /d/ (played) vs /ɪd/ (wanted)',
    phonemes: [
      {
        symbol: 't',
        word: 'walked',
        f1: 380,
        f2: 1550,
        f3: 2600,
        manner: 'stop_t',
        targetPlace: 'alveolar',
        isVoiced: false,
        description: 'Voiceless "-ed" ending (after /k, p, s, f, ʃ, tʃ/). Crisp voiceless alveolar snap.',
        somatosensoryCue: 'After voiceless /k/ in "walk", immediately snap your tongue tip to the alveolar ridge for a clean /t/ burst.'
      },
      {
        symbol: 'd',
        word: 'played',
        f1: 380,
        f2: 1550,
        f3: 2600,
        manner: 'stop_d',
        targetPlace: 'alveolar',
        isVoiced: true,
        description: 'Voiced "-ed" ending (after vowels & voiced consonants /b, ɡ, v, z, m, n, l, r/). Voiced alveolar closure.',
        somatosensoryCue: 'Keep vocal cords vibrating through the vowel /eɪ/ straight into the alveolar contact /d/ without adding a vowel syllable.'
      },
      {
        symbol: 'ɪd',
        word: 'wanted',
        f1: 400,
        f2: 1850,
        f3: 2600,
        manner: 'stop_d',
        targetPlace: 'alveolar',
        isVoiced: true,
        description: 'Syllabic "-ed" ending (only after root words ending in /t/ or /d/). Adds an extra vowel syllable /ɪd/.',
        somatosensoryCue: 'Release the first /t/ in "want", drop jaw slightly for /ɪ/, then seal again for the final /d/.'
      },
    ]
  },

  // 3. SIBILANTS & POSTALVEOLAR FRICATIVES
  {
    id: 's-sh',
    category: 'Alveolar vs. Postalveolar Sibilants',
    label: '/s/ vs /ʃ/ (sea vs she)',
    phonemes: [
      {
        symbol: 's',
        word: 'sea',
        f1: 380,
        f2: 1600,
        f3: 2600,
        manner: 'fricative_s',
        targetPlace: 'alveolar',
        isVoiced: false,
        description: 'Alveolar fricative. High tongue blade close to ridge, narrow groove, spread lips.',
        somatosensoryCue: 'Smile slightly with spread lips; direct a thin, sharp stream of air at your upper incisors.'
      },
      {
        symbol: 'ʃ',
        word: 'she',
        f1: 380,
        f2: 1800,
        f3: 2600,
        manner: 'fricative_sh',
        targetPlace: 'postalveolar',
        isVoiced: false,
        description: 'Postalveolar fricative. Tongue blade domes behind ridge with lip protrusion / rounding.',
        somatosensoryCue: 'Pucker your lips slightly and pull your tongue back into the roof dome to create a soft "shhh" hush.'
      },
    ]
  },

  // 4. RHOTIC VS. LATERAL APPROXIMANTS (F3 Rhoticity)
  {
    id: 'r-l',
    category: 'Rhotic /r/ vs Lateral /l/ (F3 Tracking)',
    label: '/r/ vs /l/ (read vs lead)',
    phonemes: [
      {
        symbol: 'r',
        word: 'read',
        f1: 420,
        f2: 1200,
        f3: 1680,
        manner: 'vowel',
        targetPlace: 'alveolar',
        description: 'Alveolar/Postalveolar rhotic approximant. Low F3 (<1800Hz) from bunched tongue or retroflex tip.',
        somatosensoryCue: 'Pull your tongue back and bunch the body; touch upper side molars while keeping the tip floating free.'
      },
      {
        symbol: 'l',
        word: 'lead',
        f1: 420,
        f2: 1050,
        f3: 2750,
        manner: 'vowel',
        targetPlace: 'alveolar',
        description: 'Lateral approximant. Tongue tip firmly anchored to alveolar ridge, airflow around lateral margins.',
        somatosensoryCue: 'Anchor the tip of your tongue firmly against the alveolar ridge behind your front teeth; release air around the sides.'
      },
    ]
  },

  // 5. VOWEL HEIGHT & FRONTNESS
  {
    id: 'i-I',
    category: 'Vowel Frontness / Tension',
    label: '/iː/ vs /ɪ/ (fleece vs kit)',
    phonemes: [
      {
        symbol: 'iː',
        word: 'fleece',
        f1: 280,
        f2: 2250,
        f3: 2850,
        manner: 'vowel',
        targetPlace: 'palatal',
        description: 'High front tense vowel. Tongue blade high near hard palate, lips spread.',
        somatosensoryCue: 'Feel the lateral edges of your tongue pressing firmly against your upper molars with high muscular tension.'
      },
      {
        symbol: 'ɪ',
        word: 'kit',
        f1: 400,
        f2: 1900,
        f3: 2600,
        manner: 'vowel',
        targetPlace: 'palatal',
        description: 'Mid-high front lax vowel. Relaxed jaw, slight tongue drop.',
        somatosensoryCue: 'Drop your jaw slightly; feel your tongue soften and relax away from the roof of your mouth.'
      },
    ]
  },
  {
    id: 'ae-v',
    category: 'Vowel Openness / Jaw Drop',
    label: '/æ/ vs /ʌ/ (trap vs strut)',
    phonemes: [
      {
        symbol: 'æ',
        word: 'trap',
        f1: 750,
        f2: 1650,
        f3: 2450,
        manner: 'vowel',
        targetPlace: 'vowel',
        description: 'Low front unrounded vowel. Maximum jaw drop with low tongue dorsum.',
        somatosensoryCue: 'Drop your jaw wide down. The tongue tip rests against the lower teeth while the front body stays flat.'
      },
      {
        symbol: 'ʌ',
        word: 'strut',
        f1: 650,
        f2: 1250,
        f3: 2500,
        manner: 'vowel',
        targetPlace: 'vowel',
        description: 'Mid-low central vowel. Neutral relaxed vocal tract.',
        somatosensoryCue: 'Keep your mouth and tongue completely relaxed in the center of the oral cavity.'
      },
    ]
  },
  {
    id: 'e-ei',
    category: 'Monophthong vs Diphthong Glide',
    label: '/e/ vs /eɪ/ (dress vs face)',
    phonemes: [
      {
        symbol: 'e',
        word: 'dress',
        f1: 550,
        f2: 1850,
        f3: 2600,
        manner: 'vowel',
        targetPlace: 'palatal',
        description: 'Mid front unrounded vowel. Moderate jaw drop.',
        somatosensoryCue: 'Feel the edges of your tongue touching your upper premolars with a relaxed jaw.'
      },
      {
        symbol: 'eɪ',
        word: 'face',
        f1: 450,
        f2: 1950,
        f3: 2650,
        manner: 'vowel',
        targetPlace: 'palatal',
        glideTo: { f1: 320, f2: 2200, f3: 2800 },
        description: 'Diphthong. Starts mid-front and glides upward and forward to high-front.',
        somatosensoryCue: 'Feel your jaw close slightly as your tongue slides smoothly forward and upward.'
      },
    ]
  },
  {
    id: 'u-U',
    category: 'High Back Vowel Tension',
    label: '/uː/ vs /ʊ/ (goose vs foot)',
    phonemes: [
      {
        symbol: 'uː',
        word: 'goose',
        f1: 300,
        f2: 850,
        f3: 2350,
        manner: 'vowel',
        targetPlace: 'velar',
        description: 'High back rounded tense vowel. Tongue dorsum high near velum, pursed lips.',
        somatosensoryCue: 'Pucker your lips tightly and feel the back of your tongue rise high near the soft palate.'
      },
      {
        symbol: 'ʊ',
        word: 'foot',
        f1: 450,
        f2: 1050,
        f3: 2400,
        manner: 'vowel',
        targetPlace: 'velar',
        description: 'Mid-high back lax vowel. Relaxed lip rounding.',
        somatosensoryCue: 'Relax your lips and jaw slightly compared to /u:/; the back of your tongue lowers slightly.'
      },
    ]
  }
];

export function PronunciationCoach() {
  const [activePair, setActivePair] = useState<MinimalPairGroup>(MINIMAL_PAIRS[0]);
  const [activePhoneme, setActivePhoneme] = useState<PhonemeTarget>(MINIMAL_PAIRS[0].phonemes[0]);

  const [isRecording, setIsRecording] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isSpeakingRef = useRef(false);
  const [isPlayingNative, setIsPlayingNative] = useState(false);
  const [isGlideMode, setIsGlideMode] = useState(false);
  const [isExaggerateMode, setIsExaggerateMode] = useState(false);

  // UI State
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  // Calibration State (Non-blocking)
  const [showCalibrationModal, setShowCalibrationModal] = useState(false);
  const [calibrationPhase, setCalibrationPhase] = useState<'idle' | 'recording_ahh' | 'recording_eee'>('idle');
  const [userCalibration, setUserCalibration] = useState({
    ahh: { f1: 750, f2: 1200 },
    eee: { f1: 280, f2: 2250 }
  });

  // Target coordinates for display
  const [displayTarget, setDisplayTarget] = useState({
    f1: MINIMAL_PAIRS[0].phonemes[0].f1,
    f2: MINIMAL_PAIRS[0].phonemes[0].f2,
    f3: MINIMAL_PAIRS[0].phonemes[0].f3 || 2600
  });

  // Load saved calibration
  useEffect(() => {
    try {
      const saved = localStorage.getItem('vocal_calibration');
      if (saved) {
        setUserCalibration(JSON.parse(saved));
      }
    } catch {}
  }, []);

  // Update display target
  useEffect(() => {
    if (!isGlideMode) {
      if (isExaggerateMode) {
        const centerF1 = 500;
        const centerF2 = 1500;
        const pushFactor = 1.25;

        setDisplayTarget({
          f1: Math.round(centerF1 + (activePhoneme.f1 - centerF1) * pushFactor),
          f2: Math.round(centerF2 + (activePhoneme.f2 - centerF2) * pushFactor),
          f3: activePhoneme.f3 || 2600
        });
      } else {
        setDisplayTarget({
          f1: activePhoneme.f1,
          f2: activePhoneme.f2,
          f3: activePhoneme.f3 || 2600
        });
      }
    }
  }, [activePhoneme, isGlideMode, isExaggerateMode]);

  // Audio Recording & Analysis State
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [activeAnalyser, setActiveAnalyser] = useState<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);

  // AI Analysis & Client Evaluation State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [transcribedText, setTranscribedText] = useState<string | null>(null);
  const recordedSamplesRef = useRef<FormantSample[]>([]);
  const speechRecognitionRef = useRef<any>(null);

  const [aiResult, setAiResult] = useState<{
    overallScore: number;
    prescriptiveFeedback: string;
    segmentation: { phoneme: string; observation: string }[];
    metrics?: {
      measuredF1: number;
      measuredF2: number;
      measuredF3: number;
      targetF1: number;
      targetF2: number;
      f1Delta: number;
      f2Delta: number;
      averagePitch: number;
      stabilityScore: number;
      voicingDetected: boolean;
      durationMs: number;
    };
  } | null>(null);

  // Audio Input Source State (Microphone, System/Tab Audio from Student Call, File Upload)
  const [audioInputSource, setAudioInputSource] = useState<'mic' | 'system' | 'file'>('mic');
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bufferSourceRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    const loadAudioDevices = async () => {
      try {
        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const audioInputs = devices.filter((d) => d.kind === 'audioinput');
          setAvailableDevices(audioInputs);
        }
      } catch (err) {
        console.warn('Could not enumerate audio devices:', err);
      }
    };
    loadAudioDevices();
  }, []);

  // Custom Word State
  const [customWord, setCustomWord] = useState('');
  const [isAnalyzingCustomWord, setIsAnalyzingCustomWord] = useState(false);
  const [customWordData, setCustomWordData] = useState<{
    syllables: string[];
    intonation: string;
  } | null>(null);

  // Real-time Formant Refs (60 FPS low-latency rendering)
  const currentF1Ref = useRef(500);
  const currentF2Ref = useRef(1500);
  const currentF3Ref = useRef(2500);
  const [debugF1, setDebugF1] = useState(500);
  const [debugF2, setDebugF2] = useState(1500);
  const [debugF3, setDebugF3] = useState(2500);

  // Gamification state
  const [score, setScore] = useState(0);
  const [activeTime, setActiveTime] = useState(0);
  const [lockInTime, setLockInTime] = useState(0);
  const [isLockedIn, setIsLockedIn] = useState(false);

  // Synth AudioContext
  const synthAudioCtxRef = useRef<AudioContext | null>(null);

  const getSynthAudioContext = () => {
    if (!synthAudioCtxRef.current) {
      synthAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (synthAudioCtxRef.current.state === 'suspended') {
      synthAudioCtxRef.current.resume();
    }
    return synthAudioCtxRef.current;
  };

  const playChime = useCallback(() => {
    try {
      const audioCtx = getSynthAudioContext();
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';

      osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime);
      osc1.frequency.exponentialRampToValueAtTime(1046.5, audioCtx.currentTime + 0.14);

      osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(1318.5, audioCtx.currentTime + 0.14);

      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.35, audioCtx.currentTime + 0.04);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.2);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(audioCtx.currentTime + 1.2);
      osc2.stop(audioCtx.currentTime + 1.2);
    } catch (e) {
      console.error('Could not play chime', e);
    }
  }, []);

  // Practice Mode: Anchor & Glide
  const startGlideMode = () => {
    if (isGlideMode || isRecording) return;
    setIsGlideMode(true);

    const anchorF1 = 500;
    const anchorF2 = 1500;
    const anchorF3 = 2500;
    setDisplayTarget({ f1: anchorF1, f2: anchorF2, f3: anchorF3 });

    const duration = 3500;
    const startTime = Date.now() + 800;

    const animate = () => {
      const now = Date.now();
      if (now < startTime) {
        requestAnimationFrame(animate);
        return;
      }

      const progress = Math.min(1, (now - startTime) / duration);
      const ease = progress * progress * (3 - 2 * progress);

      const finalTargetF1 = activePhoneme.f1;
      const finalTargetF2 = activePhoneme.f2;
      const finalTargetF3 = activePhoneme.f3 || 2600;

      const nextF1 = Math.round(anchorF1 + (finalTargetF1 - anchorF1) * ease);
      const nextF2 = Math.round(anchorF2 + (finalTargetF2 - anchorF2) * ease);
      const nextF3 = Math.round(anchorF3 + (finalTargetF3 - anchorF3) * ease);

      setDisplayTarget({ f1: nextF1, f2: nextF2, f3: nextF3 });

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setTimeout(() => setIsGlideMode(false), 1500);
      }
    };

    requestAnimationFrame(animate);
  };

  // Practice Mode: Real Native Audio Playback & Formant/Consonant Synthesis
  const playNativeExample = () => {
    if (isPlayingNative) return;
    setIsPlayingNative(true);

    const audioCtx = getSynthAudioContext();

    playNativeSpeech(
      audioCtx,
      activePhoneme.word,
      {
        f1: activePhoneme.f1,
        f2: activePhoneme.f2,
        f3: activePhoneme.f3,
        manner: activePhoneme.manner,
        isVoiced: activePhoneme.isVoiced,
        glideTo: activePhoneme.glideTo,
        duration: 1.1
      },
      () => {
        const duration = 1200;
        const startTime = Date.now();

        const animate = () => {
          const now = Date.now();
          const progress = (now - startTime) / duration;

          if (progress < 1) {
            const factor = Math.sin(progress * Math.PI);
            currentF1Ref.current = 500 + (activePhoneme.f1 - 500) * factor;
            currentF2Ref.current = 1500 + (activePhoneme.f2 - 1500) * factor;
            currentF3Ref.current = 2500 + ((activePhoneme.f3 || 2500) - 2500) * factor;
            requestAnimationFrame(animate);
          } else {
            setIsPlayingNative(false);
            currentF1Ref.current = 500;
            currentF2Ref.current = 1500;
            currentF3Ref.current = 2500;
          }
        };

        requestAnimationFrame(animate);
      },
      () => {
        setIsPlayingNative(false);
      }
    );
  };

  // Gamification Loop
  const displayTargetRef = useRef(displayTarget);
  useEffect(() => {
    displayTargetRef.current = displayTarget;
  }, [displayTarget]);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if ((isRecording && isSpeaking) || (debugMode && !isPlayingNative)) {
      interval = setInterval(() => {
        setActiveTime((prev) => {
          const nextTime = prev + 0.1;
          if (Math.floor(nextTime) > Math.floor(prev)) {
            setScore((s) => s + 1);
          }
          return nextTime;
        });

        const currentTarget = displayTargetRef.current;
        const f1Diff = Math.abs(currentF1Ref.current - currentTarget.f1);
        const f2Diff = Math.abs(currentF2Ref.current - currentTarget.f2);
        const threshold = 150;

        const isTargetHit = f1Diff < threshold && f2Diff < threshold * 1.5;

        if (isTargetHit) {
          setLockInTime((prev) => {
            const nextTime = prev + 0.1;
            if (nextTime >= 3.0 && prev < 3.0) {
              setIsLockedIn(true);
              playChime();
              setScore((s) => s + 50);
              setTimeout(() => setIsLockedIn(false), 2200);
            }
            return nextTime;
          });
        } else {
          setLockInTime(0);
        }
      }, 100);
    } else {
      setLockInTime(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording, isSpeaking, debugMode, isPlayingNative, playChime]);

  // Sync debug mode sliders
  useEffect(() => {
    if (debugMode) {
      currentF1Ref.current = debugF1;
      currentF2Ref.current = debugF2;
      currentF3Ref.current = debugF3;
    }
  }, [debugMode, debugF1, debugF2, debugF3]);

  // Feedback Text Generator
  const getFeedbackMessage = () => {
    if (isGlideMode) {
      return 'Start at the neutral sound /ə/, then slowly glide towards the target vocal posture.';
    }
    if (isPlayingNative) {
      return 'Listening to native audio example & observing articulatory kinematics...';
    }
    if (!isRecording && !debugMode) {
      return 'Click "Start Recording" or activate "Debug Sliders" to begin practicing.';
    }
    if (isRecording && !isSpeaking) {
      return 'Listening... Speak or hold the target sound clearly into your microphone.';
    }

    const currentTarget = displayTarget;
    const f1Diff = currentF1Ref.current - currentTarget.f1;
    const f2Diff = currentF2Ref.current - currentTarget.f2;
    const threshold = 140;

    if (activePhoneme.targetPlace === 'interdental') {
      return 'Interdental target: extend your tongue tip between your upper and lower teeth!';
    }
    if (activePhoneme.targetPlace === 'alveolar' && activePhoneme.manner === 'stop_t') {
      return 'Alveolar stop: snap your tongue tip firmly against the ridge behind upper teeth!';
    }

    if (Math.abs(f1Diff) < threshold && Math.abs(f2Diff) < threshold * 1.4) {
      return 'Excellent articulatory target match! Hold this vocal posture.';
    }
    if (f1Diff > threshold) {
      return 'Close your jaw more / raise your tongue higher.';
    }
    if (f1Diff < -threshold) {
      return 'Open your jaw wider / lower your tongue body.';
    }
    if (f2Diff > threshold * 1.4) {
      return 'Retract your tongue further back towards the throat.';
    }
    if (f2Diff < -threshold * 1.4) {
      return 'Advance your tongue further forward towards the front teeth.';
    }
    return 'Adjusting vocal posture...';
  };

  const feedbackText = getFeedbackMessage();

  // Start Real-Time Audio Recording & Hybrid Formant Analysis
  const startRecording = async (mode: 'practice' | 'calibration' = 'practice') => {
    try {
      let stream: MediaStream | null = null;

      if (audioInputSource === 'mic') {
        try {
          const constraints: MediaStreamConstraints = {
            audio: selectedDeviceId
              ? {
                  deviceId: { ideal: selectedDeviceId },
                  echoCancellation: false,
                  noiseSuppression: false,
                  autoGainControl: true
                }
              : {
                  echoCancellation: false,
                  noiseSuppression: false,
                  autoGainControl: true
                }
          };
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (constraintErr) {
          console.warn('Detailed getUserMedia constraints failed, attempting fallback { audio: true }:', constraintErr);
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch (micErr: any) {
            console.warn('Microphone permission or access error:', micErr);
            if (micErr?.name === 'NotAllowedError' || micErr?.name === 'PermissionDeniedError') {
              alert('Microphone permission was not granted. Please allow microphone access in your browser settings, or switch to "System / Tab" or "Student File" mode.');
            } else if (micErr?.name === 'NotFoundError' || micErr?.name === 'DevicesNotFoundError') {
              alert('No microphone was detected on this system. You can switch to "System / Tab" or "Student File" mode.');
            } else {
              alert(`Microphone access notice: ${micErr?.message || micErr?.name || 'Could not start audio stream'}.`);
            }
            return;
          }
        }
      } else if (audioInputSource === 'system') {
        // Capture system/tab audio (e.g. from Zoom / Google Meet / student video call)
        try {
          const displayStream = await navigator.mediaDevices.getDisplayMedia({
            video: { width: { ideal: 1 }, height: { ideal: 1 }, frameRate: { ideal: 1 } },
            audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
          });

          const audioTracks = displayStream.getAudioTracks();
          if (audioTracks.length === 0) {
            displayStream.getTracks().forEach((t) => t.stop());
            alert('No audio track detected. When sharing, make sure to check "Share tab audio" or "Share system audio" in the popup window.');
            return;
          }

          // Stop video track to conserve resources
          displayStream.getVideoTracks().forEach((t) => t.stop());

          stream = new MediaStream(audioTracks);

          // If student call share is ended from browser banner
          audioTracks[0].onended = () => {
            stopRecording();
          };
        } catch (displayErr) {
          console.warn('System/Tab audio capture was cancelled or failed:', displayErr);
          return;
        }
      }

      if (!stream) return;
      setMediaStream(stream);

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);

      audioCtxRef.current = audioCtx;
      sourceRef.current = source;
      analyserRef.current = analyser;
      setActiveAnalyser(analyser);

      // Attempt to load AudioWorklet for downsampled LPC
      try {
        await audioCtx.audioWorklet.addModule('/worklets/formant-processor.js');
        const workletNode = new AudioWorkletNode(audioCtx, 'formant-processor');
        source.connect(workletNode);
        workletNodeRef.current = workletNode;

        workletNode.port.onmessage = (event) => {
          if (isPlayingNative) return;
          const { isSpeaking: speaking, f1, f2, f3 } = event.data;

          setIsSpeaking(speaking);
          isSpeakingRef.current = speaking;

          if (speaking) {
            currentF1Ref.current = currentF1Ref.current * 0.4 + f1 * 0.6;
            currentF2Ref.current = currentF2Ref.current * 0.4 + f2 * 0.6;
            if (f3) currentF3Ref.current = currentF3Ref.current * 0.4 + f3 * 0.6;

            recordedSamplesRef.current.push({
              f1,
              f2,
              f3: f3 || 2500,
              volume: 0.8,
              isSpeaking: true,
              timestamp: Date.now()
            });
          }
        };
      } catch (workletErr) {
        console.warn('AudioWorklet fallback to Web Audio FFT:', workletErr);
      }

      // Hybrid Main-Thread High-Speed Spectrum Analyzer
      const bufferLength = analyser.frequencyBinCount;
      const freqData = new Uint8Array(bufferLength);
      const sampleRate = audioCtx.sampleRate;
      const binWidth = (sampleRate / 2) / bufferLength;

      const f1MinBin = Math.floor(180 / binWidth);
      const f1MaxBin = Math.ceil(1100 / binWidth);
      const f2MinBin = Math.floor(700 / binWidth);
      const f2MaxBin = Math.ceil(2700 / binWidth);

      const analyzeFrame = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(freqData);

        let speechEnergy = 0;
        for (let i = f1MinBin; i <= f2MaxBin; i++) {
          speechEnergy += freqData[i];
        }
        const avgEnergy = speechEnergy / (f2MaxBin - f1MinBin + 1);

        if (avgEnergy > 14) {
          setIsSpeaking(true);
          isSpeakingRef.current = true;

          let maxF1Val = 0;
          let maxF1Bin = f1MinBin;
          for (let i = f1MinBin; i <= f1MaxBin; i++) {
            if (freqData[i] > maxF1Val) {
              maxF1Val = freqData[i];
              maxF1Bin = i;
            }
          }

          let maxF2Val = 0;
          let maxF2Bin = f2MinBin;
          for (let i = Math.max(f2MinBin, maxF1Bin + 4); i <= f2MaxBin; i++) {
            if (freqData[i] > maxF2Val) {
              maxF2Val = freqData[i];
              maxF2Bin = i;
            }
          }

          const rawF1 = maxF1Bin * binWidth;
          const rawF2 = maxF2Bin * binWidth;

          currentF1Ref.current = currentF1Ref.current * 0.75 + rawF1 * 0.25;
          currentF2Ref.current = currentF2Ref.current * 0.75 + rawF2 * 0.25;

          if (!workletNodeRef.current) {
            recordedSamplesRef.current.push({
              f1: rawF1,
              f2: rawF2,
              f3: 2500,
              volume: avgEnergy / 100,
              isSpeaking: true,
              timestamp: Date.now()
            });
          }
        } else if (!workletNodeRef.current) {
          setIsSpeaking(false);
          isSpeakingRef.current = false;
          currentF1Ref.current = currentF1Ref.current * 0.94 + 500 * 0.06;
          currentF2Ref.current = currentF2Ref.current * 0.94 + 1500 * 0.06;
        }

        animationFrameIdRef.current = requestAnimationFrame(analyzeFrame);
      };

      animationFrameIdRef.current = requestAnimationFrame(analyzeFrame);
      setIsRecording(true);

      if (mode === 'practice') {
        recordedSamplesRef.current = [];
        setTranscribedText(null);

        // Optional Web Speech Recognition (ASR) in browser
        if (typeof window !== 'undefined') {
          const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
          if (SpeechRecognitionClass) {
            try {
              const sr = new SpeechRecognitionClass();
              sr.continuous = false;
              sr.interimResults = false;
              sr.lang = 'en-US';
              sr.onresult = (event: any) => {
                const text = event.results?.[0]?.[0]?.transcript;
                if (text) setTranscribedText(text);
              };
              sr.start();
              speechRecognitionRef.current = sr;
            } catch (asrErr) {
              console.warn('SpeechRecognition initialization notice:', asrErr);
            }
          }
        }

        try {
          const recorder = new MediaRecorder(stream);
          mediaRecorderRef.current = recorder;
          audioChunksRef.current = [];

          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunksRef.current.push(e.data);
          };

          recorder.onstop = async () => {
            await evaluateRecording();
          };

          recorder.start();
        } catch (recErr) {
          console.warn('MediaRecorder notice (relying on high-speed formant time-series):', recErr);
        }

        setAiResult(null);
      }
    } catch (err) {
      console.error('Error accessing audio source:', err);
    }
  };

  const handleStudentFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    setAiResult(null);
    setTranscribedText(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      audioCtxRef.current = audioCtx;

      const bufferSource = audioCtx.createBufferSource();
      bufferSource.buffer = audioBuffer;
      bufferSourceRef.current = bufferSource;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.6;

      bufferSource.connect(analyser);
      // Route to destination so the coach can hear the student audio
      analyser.connect(audioCtx.destination);

      analyserRef.current = analyser;
      setActiveAnalyser(analyser);

      recordedSamplesRef.current = [];

      try {
        await audioCtx.audioWorklet.addModule('/worklets/formant-processor.js');
        const workletNode = new AudioWorkletNode(audioCtx, 'formant-processor');
        bufferSource.connect(workletNode);
        workletNodeRef.current = workletNode;

        workletNode.port.onmessage = (e) => {
          const { isSpeaking: speaking, f1, f2, f3 } = e.data;
          setIsSpeaking(speaking);
          isSpeakingRef.current = speaking;
          if (speaking) {
            currentF1Ref.current = currentF1Ref.current * 0.4 + f1 * 0.6;
            currentF2Ref.current = currentF2Ref.current * 0.4 + f2 * 0.6;
            if (f3) currentF3Ref.current = currentF3Ref.current * 0.4 + f3 * 0.6;
            recordedSamplesRef.current.push({
              f1,
              f2,
              f3: f3 || 2500,
              volume: 0.8,
              isSpeaking: true,
              timestamp: Date.now()
            });
          }
        };
      } catch (workletErr) {
        console.warn('AudioWorklet file playback notice:', workletErr);
      }

      const bufferLength = analyser.frequencyBinCount;
      const freqData = new Uint8Array(bufferLength);
      const binWidth = (audioCtx.sampleRate / 2) / bufferLength;
      const f1MinBin = Math.floor(180 / binWidth);
      const f1MaxBin = Math.ceil(1100 / binWidth);
      const f2MinBin = Math.floor(700 / binWidth);
      const f2MaxBin = Math.ceil(2700 / binWidth);

      const analyzeFrame = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(freqData);

        let energy = 0;
        for (let i = f1MinBin; i <= f2MaxBin; i++) energy += freqData[i];
        const avg = energy / (f2MaxBin - f1MinBin + 1);

        if (avg > 14) {
          setIsSpeaking(true);
          isSpeakingRef.current = true;
          let maxF1 = 0;
          let b1 = f1MinBin;
          for (let i = f1MinBin; i <= f1MaxBin; i++) {
            if (freqData[i] > maxF1) { maxF1 = freqData[i]; b1 = i; }
          }
          let maxF2 = 0;
          let b2 = f2MinBin;
          for (let i = Math.max(f2MinBin, b1 + 4); i <= f2MaxBin; i++) {
            if (freqData[i] > maxF2) { maxF2 = freqData[i]; b2 = i; }
          }
          currentF1Ref.current = currentF1Ref.current * 0.75 + (b1 * binWidth) * 0.25;
          currentF2Ref.current = currentF2Ref.current * 0.75 + (b2 * binWidth) * 0.25;

          if (!workletNodeRef.current) {
            recordedSamplesRef.current.push({
              f1: b1 * binWidth,
              f2: b2 * binWidth,
              f3: 2500,
              volume: avg / 100,
              isSpeaking: true,
              timestamp: Date.now()
            });
          }
        }
        animationFrameIdRef.current = requestAnimationFrame(analyzeFrame);
      };

      animationFrameIdRef.current = requestAnimationFrame(analyzeFrame);
      setIsRecording(true);

      bufferSource.onended = () => {
        stopRecording();
        evaluateRecording();
      };

      bufferSource.start(0);
    } catch (fileErr) {
      console.error('Error decoding student audio file:', fileErr);
      alert('Could not decode student audio file. Please verify it is a valid audio format (.mp3, .wav, .m4a, .webm).');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (bufferSourceRef.current) {
      try {
        bufferSourceRef.current.stop();
      } catch (e) {
        console.warn('Error stopping buffer source:', e);
      }
      bufferSourceRef.current = null;
    }

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (e) {
        console.warn('Error stopping speech recognition:', e);
      }
      speechRecognitionRef.current = null;
    }

    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
      animationFrameIdRef.current = null;
    }

    const hadRecorder = !!mediaRecorderRef.current;
    if (mediaRecorderRef.current && isRecording) {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn('Error stopping MediaRecorder:', e);
      }
      mediaRecorderRef.current = null;
    }

    if (!hadRecorder && recordedSamplesRef.current.length > 0) {
      evaluateRecording();
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach((track) => track.stop());
      setMediaStream(null);
    }

    if (workletNodeRef.current) {
      workletNodeRef.current.port.onmessage = null;
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (audioCtxRef.current) {
      audioCtxRef.current.close();
      audioCtxRef.current = null;
    }

    setActiveAnalyser(null);
    setIsSpeaking(false);
    isSpeakingRef.current = false;
    setIsRecording(false);
  };

  const evaluateRecording = async () => {
    setIsAnalyzing(true);
    try {
      // 1. Instant High-Precision Client-Side Acoustic Scoring (Zero External API Dependency)
      const localEval = evaluateUtteranceClientSide(recordedSamplesRef.current, {
        symbol: activePhoneme.symbol,
        word: activePhoneme.word,
        f1: activePhoneme.f1,
        f2: activePhoneme.f2,
        f3: activePhoneme.f3,
        manner: activePhoneme.manner,
        targetPlace: activePhoneme.targetPlace,
        isVoiced: activePhoneme.isVoiced,
        somatosensoryCue: activePhoneme.somatosensoryCue
      });

      setAiResult(localEval);

      // 2. Seamless OpenRouter (Z-AI GLM-5.3-Flash) Enrichment in Background
      try {
        const res = await fetch('/api/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneme: activePhoneme.symbol,
            word: activePhoneme.word,
            measuredAcoustics: localEval.metrics
          })
        });

        if (res.ok) {
          const enriched = await res.json();
          setAiResult((prev) => {
            if (!prev) return enriched;
            return {
              ...prev,
              overallScore: enriched.overallScore ?? prev.overallScore,
              prescriptiveFeedback: enriched.prescriptiveFeedback || prev.prescriptiveFeedback,
              segmentation:
                enriched.segmentation && enriched.segmentation.length > 0
                  ? enriched.segmentation
                  : prev.segmentation
            };
          });
        }
      } catch (enrichErr) {
        console.warn('AI enrichment network note (instant local score retained):', enrichErr);
      }
    } catch (error) {
      console.error('Error evaluating recorded utterance:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const analyzeCustomWord = async () => {
    if (!customWord.trim()) return;

    setIsAnalyzingCustomWord(true);
    setCustomWordData(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: customWord })
      });

      const data = await response.json();
      if (!response.ok) {
        alert(data.error || 'Failed to analyze word.');
        return;
      }

      setActivePhoneme({
        symbol: data.symbol,
        word: customWord,
        f1: data.f1,
        f2: data.f2,
        targetPlace: data.f2 > 1900 ? 'palatal' : data.f2 < 1100 ? 'velar' : 'vowel',
        description: data.description,
        somatosensoryCue: data.somatosensoryCue
      });

      setCustomWordData({
        syllables: data.syllables,
        intonation: data.intonation
      });
    } catch (error) {
      console.error('Error analyzing custom word:', error);
      alert('An unexpected error occurred during custom word lookup.');
    } finally {
      setIsAnalyzingCustomWord(false);
    }
  };

  const playIntonationHum = () => {
    if (!customWordData?.intonation) return;

    try {
      const audioCtx = getSynthAudioContext();
      let startTime = audioCtx.currentTime;
      const syllables = customWordData.intonation.split('-');

      syllables.forEach((syl) => {
        const isStressed = syl === syl.toUpperCase() && syl.length > 0;
        const duration = isStressed ? 0.38 : 0.22;
        const freq = isStressed ? 330 : 220;

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(0.3, startTime + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(startTime);
        osc.stop(startTime + duration);

        startTime += duration + 0.06;
      });
    } catch (e) {
      console.error('Could not play intonation hum', e);
    }
  };

  const startCalibration = async () => {
    setCalibrationPhase('recording_ahh');
    await startRecording('calibration');

    const ahhSamples: { f1: number[]; f2: number[] } = { f1: [], f2: [] };
    const ahhInterval = setInterval(() => {
      if (isSpeakingRef.current) {
        ahhSamples.f1.push(currentF1Ref.current);
        ahhSamples.f2.push(currentF2Ref.current);
      }
    }, 100);

    setTimeout(() => {
      clearInterval(ahhInterval);
      const avgAhhF1 = ahhSamples.f1.length > 0 ? ahhSamples.f1.reduce((a, b) => a + b, 0) / ahhSamples.f1.length : 780;
      const avgAhhF2 = ahhSamples.f2.length > 0 ? ahhSamples.f2.reduce((a, b) => a + b, 0) / ahhSamples.f2.length : 1150;

      setCalibrationPhase('recording_eee');

      const eeeSamples: { f1: number[]; f2: number[] } = { f1: [], f2: [] };
      const eeeInterval = setInterval(() => {
        if (isSpeakingRef.current) {
          eeeSamples.f1.push(currentF1Ref.current);
          eeeSamples.f2.push(currentF2Ref.current);
        }
      }, 100);

      setTimeout(() => {
        clearInterval(eeeInterval);
        const avgEeeF1 = eeeSamples.f1.length > 0 ? eeeSamples.f1.reduce((a, b) => a + b, 0) / eeeSamples.f1.length : 280;
        const avgEeeF2 = eeeSamples.f2.length > 0 ? eeeSamples.f2.reduce((a, b) => a + b, 0) / eeeSamples.f2.length : 2250;

        const finalCalibration = {
          ahh: { f1: Math.round(avgAhhF1), f2: Math.round(avgAhhF2) },
          eee: { f1: Math.round(avgEeeF1), f2: Math.round(avgEeeF2) }
        };

        setUserCalibration(finalCalibration);
        try {
          localStorage.setItem('vocal_calibration', JSON.stringify(finalCalibration));
        } catch {}

        stopRecording();
        setCalibrationPhase('idle');
        setShowCalibrationModal(false);
      }, 2500);
    }, 2500);
  };

  return (
    <div className="h-full w-full flex flex-col lg:flex-row gap-4 overflow-hidden relative text-slate-100">
      {/* Quick Calibration Modal */}
      {showCalibrationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <div className="bg-slate-900 p-7 rounded-3xl shadow-2xl max-w-md w-full text-center border border-slate-700 relative">
            <h2 className="text-xl font-bold text-white mb-1.5">Vocal Calibration</h2>
            <p className="text-slate-400 mb-5 text-xs">
              Calibrates formant normalization to your vocal tract dimensions.
            </p>

            {calibrationPhase === 'idle' && (
              <div className="space-y-2.5">
                <button
                  onClick={startCalibration}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-sm shadow-md transition"
                >
                  Begin Quick Calibration (5s)
                </button>
                <button
                  onClick={() => setShowCalibrationModal(false)}
                  className="w-full py-2 text-slate-400 hover:text-white text-xs font-medium"
                >
                  Close & Use Defaults
                </button>
              </div>
            )}

            {calibrationPhase === 'recording_ahh' && (
              <div className="py-5">
                <div className="text-5xl font-serif text-amber-400 mb-2 animate-bounce">/ɑː/</div>
                <p className="font-semibold text-white text-base">Say &quot;AHH&quot;...</p>
                <p className="text-xs text-slate-400 mt-1">Open jaw relaxed as in &quot;palm&quot;</p>
              </div>
            )}

            {calibrationPhase === 'recording_eee' && (
              <div className="py-5">
                <div className="text-5xl font-serif text-emerald-400 mb-2 animate-bounce">/iː/</div>
                <p className="font-semibold text-white text-base">Say &quot;EEE&quot;...</p>
                <p className="text-xs text-slate-400 mt-1">High front smile as in &quot;fleece&quot;</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Left Column: Target Sound, Controls, Library & Oscilloscope */}
      <div className="w-full lg:w-[380px] xl:w-[410px] shrink-0 flex flex-col gap-3.5 overflow-y-auto max-h-full pr-1 pb-4">
        {/* Target Sound & Practice Controls */}
        <div className="bg-slate-900/90 rounded-2xl p-4.5 border border-slate-800 shadow-md">
          {/* Gamification Scoreboard */}
          <div className="flex items-center justify-between mb-3.5 pb-3 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span className="font-bold text-slate-200 text-sm">Score: {score}</span>
            </div>
            <div className="text-xs font-medium text-slate-400">
              Active: {Math.floor(activeTime / 60)}:{(Math.floor(activeTime % 60)).toString().padStart(2, '0')}
            </div>
          </div>

          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Target Sound</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowCalibrationModal(true)}
                className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition"
                title="Vocal Calibration"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setDebugMode(!debugMode)}
                className={`p-1.5 rounded-lg transition-colors ${
                  debugMode ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
                title="Toggle Debug Sliders"
              >
                <Settings2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Active Target Banner */}
          <div className="flex flex-col items-center justify-center py-4 px-3 bg-slate-950/80 rounded-xl border border-slate-800/90 mb-3.5">
            <div className="text-4xl font-serif text-indigo-400 mb-0.5">/{activePhoneme.symbol}/</div>
            <div className="text-slate-400 font-medium flex items-center gap-1 text-xs">
              as in <span className="text-white font-bold">&quot;{activePhoneme.word}&quot;</span>
            </div>

            {/* Target Articulatory Place Badge */}
            {activePhoneme.targetPlace && (
              <div className="mt-2 flex items-center gap-1.5 px-2.5 py-0.5 bg-indigo-950/80 text-indigo-300 border border-indigo-800/60 rounded-full text-[11px] font-bold uppercase tracking-wider">
                <Target className="w-3 h-3 text-indigo-400" />
                Place: {activePhoneme.targetPlace}
              </div>
            )}

            {/* Somatosensory Cue */}
            {activePhoneme.somatosensoryCue && (
              <div className="mt-2.5 w-full px-3 py-2 bg-indigo-950/40 border border-indigo-900/60 rounded-xl text-xs text-indigo-200 text-center leading-relaxed">
                <span className="font-bold block mb-0.5 text-indigo-400 uppercase tracking-wider text-[10px]">Feel It Here:</span>
                {activePhoneme.somatosensoryCue}
              </div>
            )}

            {/* Practice Action Modes */}
            <div className="flex items-center gap-2 mt-3 w-full justify-center">
              <button
                onClick={playNativeExample}
                disabled={isPlayingNative || isRecording}
                className={`flex-1 py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors ${
                  isPlayingNative
                    ? 'bg-indigo-900 text-indigo-300 cursor-not-allowed'
                    : 'bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 hover:text-white border border-indigo-500/30'
                }`}
              >
                <Volume2 className="w-3.5 h-3.5" />
                {isPlayingNative ? 'Playing...' : 'Native Audio'}
              </button>

              <button
                onClick={startGlideMode}
                disabled={isGlideMode || isRecording}
                className={`flex-1 py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors ${
                  isGlideMode
                    ? 'bg-purple-900 text-purple-300 cursor-not-allowed'
                    : 'bg-purple-600/30 hover:bg-purple-600 text-purple-200 hover:text-white border border-purple-500/30'
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isGlideMode ? 'animate-spin' : ''}`} />
                {isGlideMode ? 'Gliding...' : 'Anchor & Glide'}
              </button>
            </div>

            {/* Over-Exaggeration Toggle */}
            <div className="mt-2.5 w-full flex items-center justify-between bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-xl">
              <div>
                <h4 className="text-[11px] font-semibold text-rose-300">Over-Exaggeration</h4>
                <p className="text-[10px] text-slate-400">Pushes target 25% further</p>
              </div>
              <button
                onClick={() => setIsExaggerateMode(!isExaggerateMode)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  isExaggerateMode ? 'bg-rose-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    isExaggerateMode ? 'translate-x-4.5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Phoneme Library Accordion */}
          <div className="space-y-1.5">
            <button
              onClick={() => setIsLibraryOpen(!isLibraryOpen)}
              className="w-full flex items-center justify-between p-2.5 bg-slate-950/70 hover:bg-slate-950 rounded-xl transition border border-slate-800"
            >
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Phonetic Sounds & Consonants</h3>
              {isLibraryOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            <AnimatePresence>
              {isLibraryOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl mt-1 space-y-2.5">
                    <div className="flex flex-col gap-1 max-h-40 overflow-y-auto pr-1">
                      {MINIMAL_PAIRS.map((pair) => (
                        <button
                          key={pair.id}
                          onClick={() => {
                            setActivePair(pair);
                            setActivePhoneme(pair.phonemes[0]);
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-left text-xs font-medium transition-colors flex items-center justify-between ${
                            activePair.id === pair.id
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <span>{pair.label}</span>
                          <span className="text-[10px] opacity-70 ml-2">{pair.category}</span>
                        </button>
                      ))}
                    </div>

                    <div className={`grid ${activePair.phonemes.length === 3 ? 'grid-cols-3' : 'grid-cols-2'} gap-1.5`}>
                      {activePair.phonemes.map((p) => (
                        <button
                          key={`${p.symbol}-${p.word}`}
                          onClick={() => {
                            setActivePhoneme(p);
                            setCustomWordData(null);
                            setIsLibraryOpen(false);
                          }}
                          className={`py-2 px-1.5 rounded-lg font-serif text-center transition-all flex flex-col items-center justify-center ${
                            activePhoneme.symbol === p.symbol && activePhoneme.word === p.word
                              ? 'bg-indigo-600 text-white shadow-md'
                              : 'bg-slate-900 border border-slate-800 text-slate-300 hover:border-indigo-500 hover:bg-slate-850'
                          }`}
                        >
                          <span className="text-base font-bold">/{p.symbol}/</span>
                          <span className="text-[11px] font-sans font-normal opacity-80">{p.word}</span>
                        </button>
                      ))}
                    </div>

                    {/* Custom Word Input */}
                    <div className="border-t border-slate-800 pt-2.5">
                      <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Analyze Custom Word
                      </h4>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          placeholder="e.g. phenomenon, thought"
                          value={customWord}
                          onChange={(e) => setCustomWord(e.target.value)}
                          className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          onKeyDown={(e) => e.key === 'Enter' && analyzeCustomWord()}
                        />
                        <button
                          onClick={analyzeCustomWord}
                          disabled={isAnalyzingCustomWord || !customWord.trim()}
                          className="px-2.5 py-1 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-500 disabled:opacity-50 flex items-center justify-center min-w-[65px]"
                        >
                          {isAnalyzingCustomWord ? <RefreshCw className="w-3 h-3 animate-spin" /> : 'Analyze'}
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Custom Word Rhythm Display */}
            {customWordData && (
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-1">Syllables & Intonation</h4>
                <div className="flex flex-wrap gap-1 mb-2">
                  {customWordData.syllables.map((syl, i) => (
                    <span key={i} className="px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-slate-200 text-xs font-medium">
                      {syl}
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-indigo-300 bg-indigo-950/80 px-2 py-0.5 rounded-full border border-indigo-800">
                    {customWordData.intonation}
                  </span>
                  <button
                    onClick={playIntonationHum}
                    className="p-1 bg-indigo-900/60 text-indigo-300 rounded hover:bg-indigo-800"
                    title="Play Intonation Melody"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Practice Audio Control Card */}
        <div className="bg-slate-900/90 rounded-2xl p-4.5 border border-slate-800 shadow-md">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Live Input</h2>
            <span className="text-[10px] font-semibold text-indigo-300 bg-indigo-950/80 px-2 py-0.5 rounded-full border border-indigo-800">
              {audioInputSource === 'mic' ? 'Microphone' : audioInputSource === 'system' ? 'System / Tab' : 'Student File'}
            </span>
          </div>

          {/* Audio Input Source Selector */}
          <div className="mb-3">
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setAudioInputSource('mic')}
                disabled={isRecording}
                className={`py-1.5 px-1 rounded-lg text-xs font-semibold flex flex-col items-center gap-0.5 transition-all ${
                  audioInputSource === 'mic'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Microphone</span>
              </button>

              <button
                type="button"
                onClick={() => setAudioInputSource('system')}
                disabled={isRecording}
                className={`py-1.5 px-1 rounded-lg text-xs font-semibold flex flex-col items-center gap-0.5 transition-all ${
                  audioInputSource === 'system'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>System / Tab</span>
              </button>

              <button
                type="button"
                onClick={() => setAudioInputSource('file')}
                disabled={isRecording}
                className={`py-1.5 px-1 rounded-lg text-xs font-semibold flex flex-col items-center gap-0.5 transition-all ${
                  audioInputSource === 'file'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <FileAudio className="w-3.5 h-3.5" />
                <span>Student File</span>
              </button>
            </div>

            {/* Instructions for System Audio */}
            {audioInputSource === 'system' && (
              <div className="mt-2 p-2 bg-indigo-950/60 border border-indigo-900 rounded-lg text-[11px] text-indigo-200 leading-snug">
                💡 Select the tab with your <strong>Zoom / Meet / Video Call</strong> and enable <strong>&ldquo;Share tab audio&rdquo;</strong>.
              </div>
            )}

            {/* Student File Upload Picker */}
            {audioInputSource === 'file' && (
              <div className="mt-2 space-y-1.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,video/*"
                  onChange={handleStudentFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isRecording}
                  className="w-full py-2 px-2.5 bg-slate-950 hover:bg-slate-850 border border-dashed border-slate-700 rounded-xl text-xs font-semibold text-slate-300 flex items-center justify-center gap-1.5 transition-colors"
                >
                  <UploadCloud className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="truncate">{uploadedFileName ? `Loaded: ${uploadedFileName}` : 'Select Audio File (.mp3, .wav, .webm)'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Action Button */}
          {audioInputSource !== 'file' ? (
            <button
              onClick={isRecording ? stopRecording : () => startRecording('practice')}
              disabled={isAnalyzing}
              className={`w-full py-3 rounded-xl flex items-center justify-center gap-2.5 font-semibold text-base transition-all shadow-md ${
                isRecording
                  ? 'bg-rose-600 hover:bg-rose-500 text-white animate-pulse'
                  : isAnalyzing
                    ? 'bg-slate-850 text-slate-500 cursor-not-allowed shadow-none'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
            >
              {isRecording ? (
                <>
                  <MicOff className="w-4 h-4" />
                  {audioInputSource === 'system' ? 'Stop Capturing System Audio' : 'Stop Recording'}
                </>
              ) : isAnalyzing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Analyzing Utterance...
                </>
              ) : (
                <>
                  {audioInputSource === 'system' ? <Monitor className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  {audioInputSource === 'system' ? 'Capture System Audio' : 'Start Recording'}
                </>
              )}
            </button>
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isAnalyzing || isRecording}
              className="w-full py-3 rounded-xl flex items-center justify-center gap-2 font-semibold text-sm bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md disabled:opacity-50"
            >
              {isRecording ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Analyzing Audio File...
                </>
              ) : (
                <>
                  <FileAudio className="w-4 h-4" />
                  {uploadedFileName ? 'Play & Re-analyze File' : 'Select File to Analyze'}
                </>
              )}
            </button>
          )}

          {/* Real-time Oscilloscope, FFT & Pitch (F0) */}
          <div className="mt-3">
            <WaveformVisualizer
              stream={mediaStream}
              analyserNode={activeAnalyser}
              isRecording={isRecording}
              f1Ref={currentF1Ref}
              f2Ref={currentF2Ref}
              f3Ref={currentF3Ref}
            />
          </div>

          {/* Debug Sliders */}
          {debugMode && (
            <div className="mt-3 space-y-2 p-3 bg-amber-950/50 rounded-xl border border-amber-800/80">
              <h3 className="text-xs font-bold text-amber-300 flex items-center gap-1.5 uppercase tracking-wider">
                <Settings2 className="w-3.5 h-3.5" /> Debug Articulatory Controls
              </h3>
              <div>
                <label className="text-[11px] font-medium text-amber-200 flex justify-between mb-0.5">
                  <span>F1 (Jaw Height)</span>
                  <span className="font-bold">{Math.round(debugF1)} Hz</span>
                </label>
                <input
                  type="range"
                  min="200"
                  max="1000"
                  value={debugF1}
                  onChange={(e) => setDebugF1(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-amber-200 flex justify-between mb-0.5">
                  <span>F2 (Tongue Advancement)</span>
                  <span className="font-bold">{Math.round(debugF2)} Hz</span>
                </label>
                <input
                  type="range"
                  min="600"
                  max="2500"
                  value={debugF2}
                  onChange={(e) => setDebugF2(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-amber-200 flex justify-between mb-0.5">
                  <span>F3 (Rhotic / Retroflex)</span>
                  <span className="font-bold">{Math.round(debugF3)} Hz</span>
                </label>
                <input
                  type="range"
                  min="1600"
                  max="3200"
                  value={debugF3}
                  onChange={(e) => setDebugF3(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Visualizations & Assessment */}
      <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-y-auto max-h-full pb-4">
        {/* Real-time Feedback Banner */}
        <div
          className={`p-3.5 rounded-2xl border flex items-start gap-3 transition-colors relative overflow-hidden shadow-md shrink-0 ${
            isLockedIn
              ? 'bg-emerald-950 border-emerald-600 text-emerald-100'
              : feedbackText.includes('Excellent') || feedbackText.includes('target match')
                ? 'bg-emerald-950/70 border-emerald-800 text-emerald-200'
                : isRecording || debugMode
                  ? 'bg-indigo-950/70 border-indigo-800 text-indigo-200'
                  : 'bg-slate-900 border-slate-800 text-slate-300'
          }`}
        >
          {/* Lock-in Progress Bar */}
          {(isRecording || debugMode) && (feedbackText.includes('Excellent') || feedbackText.includes('target match')) && !isLockedIn && (
            <div
              className="absolute bottom-0 left-0 h-1 bg-emerald-500 transition-all duration-100 ease-linear"
              style={{ width: `${Math.min(100, (lockInTime / 3) * 100)}%` }}
            />
          )}

          <div
            className={`p-2 rounded-xl relative z-10 shrink-0 ${
              isLockedIn
                ? 'bg-emerald-600 text-white'
                : feedbackText.includes('Excellent') || feedbackText.includes('target match')
                  ? 'bg-emerald-900 text-emerald-300'
                  : isRecording || debugMode
                    ? 'bg-indigo-900 text-indigo-300'
                    : 'bg-slate-800 text-slate-400'
            }`}
          >
            <Activity className={`w-4 h-4 ${isLockedIn ? 'animate-bounce' : isRecording ? 'animate-pulse' : ''}`} />
          </div>

          <div className="relative z-10 flex-1">
            <div className="flex justify-between items-center">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-200">
                {isLockedIn ? '🎯 Target Locked In! (+50 Bonus Points)' : 'Real-Time Articulatory Feedback'}
              </h3>
              {(feedbackText.includes('Excellent') || feedbackText.includes('target match')) && !isLockedIn && (
                <span className="text-[11px] font-bold bg-emerald-900/80 text-emerald-300 px-2 py-0.5 rounded-full animate-pulse border border-emerald-700">
                  Hold: {Math.max(0, 3 - lockInTime).toFixed(1)}s
                </span>
              )}
            </div>
            <p className="text-xs mt-0.5 text-slate-300">{feedbackText}</p>
          </div>
        </div>

        {/* Visualizers Stage: 50 / 50 Side-by-Side Lifelike 3D & 2D */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3.5 flex-1 min-h-[440px]">
          {/* 1. Volumetric Lifelike 3D Articulatory Mesh */}
          <div className="bg-slate-900/90 rounded-2xl p-3.5 border border-slate-800 shadow-md flex flex-col min-h-[380px]">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                Lifelike 3D Vocal Tract
              </h2>
              <span className="text-[10px] text-slate-400 font-medium">360° Rotatable Tongue & Contacts</span>
            </div>
            <div className="flex-1 w-full min-h-[320px] relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
              <VocalTract
                f1Ref={currentF1Ref}
                f2Ref={currentF2Ref}
                f3Ref={currentF3Ref}
                targetF1={displayTarget.f1}
                targetF2={displayTarget.f2}
                targetF3={displayTarget.f3}
                targetPlace={activePhoneme.targetPlace}
                isActive={isRecording || debugMode || isPlayingNative}
              />
            </div>
          </div>

          {/* 2. 2D Sagittal Cross Section */}
          <div className="bg-slate-900/90 rounded-2xl p-3.5 border border-slate-800 shadow-md flex flex-col min-h-[380px]">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                2D Sagittal Section
              </h2>
              <span className="text-[10px] text-slate-400 font-medium">Kinematic Vocal Tract Profile</span>
            </div>
            <div className="flex-1 w-full min-h-[320px] relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
              <VocalTract2D
                f1Ref={currentF1Ref}
                f2Ref={currentF2Ref}
                targetF1={displayTarget.f1}
                targetF2={displayTarget.f2}
                targetPlace={activePhoneme.targetPlace}
                isActive={isRecording || debugMode || isPlayingNative}
              />
            </div>
          </div>
        </div>

        {/* Speech Assessment Feedback Panel */}
        {aiResult && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-900/95 rounded-2xl p-4.5 border border-emerald-800/80 shadow-lg space-y-3.5 shrink-0"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">Acoustic & Articulatory Assessment</h2>
              </div>
              <div className="flex items-center gap-1.5 bg-emerald-950/80 px-3 py-0.5 rounded-full border border-emerald-800">
                <span className="text-xs font-semibold text-emerald-300">Precision Score:</span>
                <span className="text-sm font-bold text-emerald-400">{aiResult.overallScore}/100</span>
              </div>
            </div>

            {/* Speech Recognition Transcript (if detected) */}
            {transcribedText && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-300">
                <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Speech Detected:</span>
                <span className="font-semibold italic text-white">&ldquo;{transcribedText}&rdquo;</span>
              </div>
            )}

            {/* Measured Acoustic Formants Telemetry */}
            {aiResult.metrics && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">F1 (Jaw Height)</div>
                  <div className="text-sm font-bold text-slate-200 mt-0.5">{aiResult.metrics.measuredF1} Hz</div>
                  <div className="text-[10px] text-slate-400 font-medium">Target: {aiResult.metrics.targetF1} Hz (Δ{aiResult.metrics.f1Delta > 0 ? '+' : ''}{aiResult.metrics.f1Delta})</div>
                </div>

                <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">F2 (Tongue Adv.)</div>
                  <div className="text-sm font-bold text-slate-200 mt-0.5">{aiResult.metrics.measuredF2} Hz</div>
                  <div className="text-[10px] text-slate-400 font-medium">Target: {aiResult.metrics.targetF2} Hz (Δ{aiResult.metrics.f2Delta > 0 ? '+' : ''}{aiResult.metrics.f2Delta})</div>
                </div>

                <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pitch (F0)</div>
                  <div className="text-sm font-bold text-slate-200 mt-0.5">
                    {aiResult.metrics.averagePitch > 0 ? `${aiResult.metrics.averagePitch} Hz` : 'Unvoiced'}
                  </div>
                  <div className="text-[10px] text-slate-400 font-medium">
                    {aiResult.metrics.voicingDetected ? 'Voiced Vowel' : 'Frication/Stop'}
                  </div>
                </div>

                <div className="bg-slate-950 p-2 rounded-xl border border-slate-800">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Stability</div>
                  <div className="text-sm font-bold text-slate-200 mt-0.5">{aiResult.metrics.stabilityScore}%</div>
                  <div className="text-[10px] text-slate-400 font-medium">{aiResult.metrics.durationMs}ms hold</div>
                </div>
              </div>
            )}

            <div>
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Prescriptive Articulatory Guidance
              </h3>
              <p className="text-slate-200 bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs leading-relaxed">
                {aiResult.prescriptiveFeedback}
              </p>
            </div>

            {aiResult.segmentation && aiResult.segmentation.length > 0 && (
              <div>
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Phonetic Breakdown
                </h3>
                <div className="space-y-1.5">
                  {aiResult.segmentation.map((seg, idx) => (
                    <div
                      key={idx}
                      className="flex gap-2.5 items-center p-2 rounded-xl border border-slate-800 bg-slate-950"
                    >
                      <div className="min-w-[34px] px-1.5 h-7 shrink-0 bg-indigo-950 text-indigo-300 font-serif text-xs rounded-lg flex items-center justify-center font-bold border border-indigo-800">
                        {seg.phoneme.startsWith('/') ? seg.phoneme : `/${seg.phoneme}/`}
                      </div>
                      <p className="text-xs text-slate-300 font-medium">{seg.observation}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
