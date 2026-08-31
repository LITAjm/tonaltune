'use client';

import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Settings2, RefreshCw, Volume2, Sparkles, Activity } from 'lucide-react';
import { VowelQuadrilateral } from './vowel-quadrilateral';
import { VocalTract } from './vocal-tract';
import { VocalTract2D } from './vocal-tract-2d';
import { WaveformVisualizer } from './waveform-visualizer';
import { GoogleGenAI, Type } from '@google/genai';

// Define target phonemes grouped by minimal pairs
export const MINIMAL_PAIRS = [
  {
    id: 'i-I',
    label: '/iː/ vs /ɪ/',
    phonemes: [
      { symbol: 'iː', word: 'fleece', f1: 300, f2: 2200, description: 'High front, unrounded. Tongue tense and forward.', somatosensoryCue: 'You should feel the sides of your tongue pressing lightly against your upper back teeth.' },
      { symbol: 'ɪ', word: 'kit', f1: 400, f2: 1800, description: 'Mid-high front, unrounded. Tongue relaxed.', somatosensoryCue: 'Your tongue should feel relaxed, dropping slightly away from the roof of your mouth compared to /i:/.' },
    ]
  },
  {
    id: 'ae-v',
    label: '/æ/ vs /ʌ/',
    phonemes: [
      { symbol: 'æ', word: 'trap', f1: 700, f2: 1600, description: 'Low front, unrounded. Jaw open.', somatosensoryCue: 'Feel your jaw drop low and your tongue push forward toward your bottom teeth.' },
      { symbol: 'ʌ', word: 'strut', f1: 600, f2: 1200, description: 'Mid-low central, unrounded. Jaw relaxed.', somatosensoryCue: 'Your tongue should feel completely neutral and relaxed in the center of your mouth.' },
    ]
  },
  {
    id: 'e-ei',
    label: '/e/ vs /eɪ/',
    phonemes: [
      { symbol: 'e', word: 'dress', f1: 500, f2: 1800, description: 'Mid front, unrounded. Relaxed.', somatosensoryCue: 'Feel the sides of your tongue gently touching your upper side teeth.' },
      { symbol: 'eɪ', word: 'face', f1: 400, f2: 2000, description: 'Diphthong. Starts mid-front, glides high-front.', somatosensoryCue: 'Feel your jaw close slightly as your tongue slides upward and forward.' },
    ]
  },
  {
    id: 'o-ou',
    label: '/ɒ/ vs /oʊ/',
    phonemes: [
      { symbol: 'ɒ', word: 'lot', f1: 700, f2: 1000, description: 'Low back, slightly rounded. Open jaw.' },
      { symbol: 'oʊ', word: 'goat', f1: 400, f2: 900, description: 'Diphthong. Starts mid-back, glides high-back.' },
    ]
  },
  {
    id: 'th-s',
    label: '/θ/ vs /s/',
    phonemes: [
      { symbol: 'θ', word: 'think', f1: 400, f2: 1500, description: 'Interdental fricative. Tongue between teeth.' },
      { symbol: 's', word: 'sink', f1: 400, f2: 1500, description: 'Alveolar fricative. Tongue behind teeth.' },
    ]
  },
  {
    id: 'r-l',
    label: '/r/ vs /l/',
    phonemes: [
      { symbol: 'r', word: 'read', f1: 450, f2: 1200, description: 'Alveolar approximant. Tongue bunched/retroflex.' },
      { symbol: 'l', word: 'lead', f1: 450, f2: 1000, description: 'Lateral approximant. Tongue tip on alveolar ridge.' },
    ]
  },
  {
    id: 'u-U',
    label: '/uː/ vs /ʊ/',
    phonemes: [
      { symbol: 'uː', word: 'goose', f1: 300, f2: 800, description: 'High back, rounded. Lips pursed.' },
      { symbol: 'ʊ', word: 'foot', f1: 450, f2: 1000, description: 'Mid-high back, rounded. Lips relaxed.' },
    ]
  }
];

export function PronunciationCoach() {
  const [activePair, setActivePair] = useState(MINIMAL_PAIRS[0]);
  const [activePhoneme, setActivePhoneme] = useState<{
    symbol: string;
    word: string;
    f1: number;
    f2: number;
    description: string;
    somatosensoryCue?: string;
  }>(MINIMAL_PAIRS[0].phonemes[0]);
  
  const [isRecording, setIsRecording] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPlayingNative, setIsPlayingNative] = useState(false);
  const [isGlideMode, setIsGlideMode] = useState(false);
  const [isExaggerateMode, setIsExaggerateMode] = useState(false);

  // Custom target state (overrides activePhoneme when gliding, exaggerating, or custom words)
  const [displayTarget, setDisplayTarget] = useState({ f1: MINIMAL_PAIRS[0].phonemes[0].f1, f2: MINIMAL_PAIRS[0].phonemes[0].f2 });

  useEffect(() => {
    // Keep display target in sync with active phoneme unless we are actively gliding
    if (!isGlideMode) {
      if (isExaggerateMode) {
        // Exaggerate mode pushes the target 20% further from neutral center (F1: 500, F2: 1500)
        const centerF1 = 500;
        const centerF2 = 1500;
        const pushFactor = 1.2;

        setDisplayTarget({
          f1: centerF1 + (activePhoneme.f1 - centerF1) * pushFactor,
          f2: centerF2 + (activePhoneme.f2 - centerF2) * pushFactor
        });
      } else {
        setDisplayTarget({ f1: activePhoneme.f1, f2: activePhoneme.f2 });
      }
    }
  }, [activePhoneme, isGlideMode, isExaggerateMode]);
  
  // Audio Recording State
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  // Real-time Audio Analysis Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // AI Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);

  // Custom Word State (OpenRouter)
  const [customWord, setCustomWord] = useState('');
  const [isAnalyzingCustomWord, setIsAnalyzingCustomWord] = useState(false);
  const [customWordData, setCustomWordData] = useState<{
    syllables: string[];
    intonation: string;
  } | null>(null);

  // Current estimated formants (simulated or debug)
  const [currentF1, setCurrentF1] = useState(500);
  const [currentF2, setCurrentF2] = useState(1500);

  // Gamification state
  const [score, setScore] = useState(0);
  const [activeTime, setActiveTime] = useState(0);
  const [lockInTime, setLockInTime] = useState(0);
  const [isLockedIn, setIsLockedIn] = useState(false);

  // Shared AudioContext for synthesized sounds to prevent exhaustion
  const synthAudioCtxRef = useRef<AudioContext | null>(null);

  const getSynthAudioContext = () => {
    if (!synthAudioCtxRef.current) {
      synthAudioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // Resume context if it was suspended (browser autoplay policy)
    if (synthAudioCtxRef.current.state === 'suspended') {
      synthAudioCtxRef.current.resume();
    }
    return synthAudioCtxRef.current;
  };

  const playChime = () => {
    try {
      const audioCtx = getSynthAudioContext();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      oscillator.frequency.exponentialRampToValueAtTime(1760, audioCtx.currentTime + 0.1); // Glide to A6

      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1.5);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 1.5);
    } catch (e) {
      console.error("Could not play chime", e);
    }
  };

  const startGlideMode = () => {
    if (isGlideMode || isRecording) return;
    setIsGlideMode(true);

    // Anchor sound: Neutral Schwa /ə/
    const anchorF1 = 500;
    const anchorF2 = 1500;

    // Set immediate target to anchor
    setDisplayTarget({ f1: anchorF1, f2: anchorF2 });

    const duration = 4000; // 4 seconds to glide
    const startTime = Date.now();

    const animate = () => {
      const now = Date.now();
      const progress = Math.min(1, (now - startTime) / duration);

      // Easing function (smooth step)
      const ease = progress * progress * (3 - 2 * progress);

      // We need to glide to the effective target (which might be exaggerated)
      let finalTargetF1 = activePhoneme.f1;
      let finalTargetF2 = activePhoneme.f2;

      if (isExaggerateMode) {
        const centerF1 = 500;
        const centerF2 = 1500;
        const pushFactor = 1.2;
        finalTargetF1 = centerF1 + (activePhoneme.f1 - centerF1) * pushFactor;
        finalTargetF2 = centerF2 + (activePhoneme.f2 - centerF2) * pushFactor;
      }

      const nextF1 = anchorF1 + (finalTargetF1 - anchorF1) * ease;
      const nextF2 = anchorF2 + (finalTargetF2 - anchorF2) * ease;

      setDisplayTarget({ f1: nextF1, f2: nextF2 });

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setTimeout(() => setIsGlideMode(false), 2000); // Wait 2s at the end before returning to normal
      }
    };

    // Give them 1 second to find the anchor, then start gliding
    setTimeout(() => {
      requestAnimationFrame(animate);
    }, 1000);
  };

  const playNativeExample = () => {
    if (isPlayingNative) return;
    setIsPlayingNative(true);
    
    // Simulate a native speaker hitting the exact targets perfectly over time
    // Neutral -> Target -> Neutral
    const duration = 1500;
    const startTime = Date.now();

    const animate = () => {
      const now = Date.now();
      const progress = (now - startTime) / duration;

      if (progress < 1) {
        // Simple bell curve easing for entering and exiting the sound
        const factor = Math.sin(progress * Math.PI);
        setCurrentF1(500 + (activePhoneme.f1 - 500) * factor);
        setCurrentF2(1500 + (activePhoneme.f2 - 1500) * factor);
        requestAnimationFrame(animate);
      } else {
        setIsPlayingNative(false);
        setCurrentF1(500);
        setCurrentF2(1500);
      }
    };

    requestAnimationFrame(animate);
  };

  // Gamification Loop - Score and Active Time tracking
  // We use Refs for currentF1 and currentF2 to avoid constantly re-running the effect
  const f1Ref = useRef(currentF1);
  const f2Ref = useRef(currentF2);
  const displayTargetRef = useRef(displayTarget);

  useEffect(() => {
    f1Ref.current = currentF1;
    f2Ref.current = currentF2;
    displayTargetRef.current = displayTarget;
  }, [currentF1, currentF2, displayTarget]);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if ((isRecording && isSpeaking) || (debugMode && !isPlayingNative)) {
      interval = setInterval(() => {
        // Add to active time (points for trying)
        setActiveTime(prev => {
           const nextTime = prev + 0.1;
           // Every 1 second of active time, add a point
           if (Math.floor(nextTime) > Math.floor(prev)) {
               setScore(s => s + 1);
           }
           return nextTime;
        });

        const currentTarget = displayTargetRef.current;
        const f1Diff = f1Ref.current - currentTarget.f1;
        const f2Diff = f2Ref.current - currentTarget.f2;
        const threshold = 150;

        const isTargetHit = Math.abs(f1Diff) < threshold && Math.abs(f2Diff) < threshold * 1.5;

        if (isTargetHit) {
          setLockInTime(prev => {
            const nextTime = prev + 0.1;
            if (nextTime >= 3.0 && prev < 3.0) { // Hit 3 seconds!
              setIsLockedIn(true);
              playChime();
              setScore(s => s + 50); // Bonus points for lock-in
              setTimeout(() => setIsLockedIn(false), 2000); // Reset visual lock-in state after 2s
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
  }, [isRecording, isSpeaking, debugMode, isPlayingNative]);


  useEffect(() => {
    if (isPlayingNative) return; // Ignore input while playing example

    if (!isRecording || debugMode) {
      if (!isRecording && !debugMode) {
        // Drift back to neutral position when not recording or debugging
        const drift = setInterval(() => {
          setCurrentF1(prev => prev * 0.95 + 500 * 0.05);
          setCurrentF2(prev => prev * 0.95 + 1500 * 0.05);
        }, 50);
        return () => clearInterval(drift);
      }
      return;
    }

    if (workletNodeRef.current) {
      workletNodeRef.current.port.onmessage = (event) => {
        if (isPlayingNative) return; // Block input if example playing
        const { isSpeaking, f1, f2, volume } = event.data;
        setIsSpeaking(isSpeaking);

        if (isSpeaking) {
          setCurrentF1(f1);
          setCurrentF2(f2);
        } else {
          // Drift back to neutral position if quiet
          setCurrentF1(prev => prev * 0.95 + 500 * 0.05);
          setCurrentF2(prev => prev * 0.95 + 1500 * 0.05);
        }
      };
    }
    
    return () => {
      if (workletNodeRef.current) {
        workletNodeRef.current.port.onmessage = null;
      }
    };
  }, [isRecording, debugMode, isPlayingNative]);

  // Generate real-time feedback based on current formants vs target
  let feedback = 'Press record and speak the word to start practicing.';

  if (isGlideMode) {
    feedback = 'Start with the neutral "uh" sound, and slowly follow the ghost tongue to the target position.';
  } else if (debugMode) {
    const f1Diff = currentF1 - displayTarget.f1;
    const f2Diff = currentF2 - displayTarget.f2;
    const threshold = 100;
    if (Math.abs(f1Diff) < threshold && Math.abs(f2Diff) < threshold * 1.5) {
      feedback = 'Excellent! Hold that position.';
    } else if (f1Diff > threshold) {
      feedback = 'Raise your tongue / close your jaw more.';
    } else if (f1Diff < -threshold) {
      feedback = 'Lower your tongue / drop your jaw more.';
    } else if (f2Diff > threshold * 1.5) {
      feedback = 'Pull your tongue further back.';
    } else if (f2Diff < -threshold * 1.5) {
      feedback = 'Push your tongue further forward.';
    }
  } else if (isRecording) {
    if (!isSpeaking) {
      feedback = 'Listening... Speak the target word clearly.';
    } else {
      const f1Diff = currentF1 - displayTarget.f1;
      const f2Diff = currentF2 - displayTarget.f2;
      const threshold = 150; // Slightly wider threshold for real audio
      
      if (Math.abs(f1Diff) < threshold && Math.abs(f2Diff) < threshold * 1.5) {
        feedback = 'Excellent! Hold that position.';
      } else if (f1Diff > threshold) {
        feedback = 'Raise your tongue / close your jaw more.';
      } else if (f1Diff < -threshold) {
        feedback = 'Lower your tongue / drop your jaw more.';
      } else if (f2Diff > threshold * 1.5) {
        feedback = 'Pull your tongue further back.';
      } else if (f2Diff < -threshold * 1.5) {
        feedback = 'Push your tongue further forward.';
      }
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMediaStream(stream);
      
      // Set up low latency real-time analysis via AudioWorklet
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      await audioCtx.audioWorklet.addModule('/worklets/formant-processor.js');

      const workletNode = new AudioWorkletNode(audioCtx, 'formant-processor');
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(workletNode);
      // We don't connect workletNode to destination to prevent feedback loop
      
      audioCtxRef.current = audioCtx;
      workletNodeRef.current = workletNode;
      sourceRef.current = source;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Clean up audio context
        if (workletNodeRef.current) {
          workletNodeRef.current.port.onmessage = null;
          workletNodeRef.current.disconnect();
        }
        if (sourceRef.current) sourceRef.current.disconnect();
        if (audioCtxRef.current) audioCtxRef.current.close();
        
        const mimeType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        
        stream.getTracks().forEach(track => track.stop());
        setMediaStream(null);
        setIsSpeaking(false);
        
        await analyzeWithGemini(audioBlob, mimeType);
      };

      recorder.start();
      setIsRecording(true);
      setAiResult(null);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Could not access microphone. Please ensure permissions are granted.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const analyzeWithGemini = async (blob: Blob, mimeType: string) => {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) {
      alert("Gemini API Key is missing. Please configure it in the AI Studio Secrets panel.");
      return;
    }

    setIsAnalyzing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64data = (reader.result as string).split(',')[1];
        
        const ai = new GoogleGenAI({ apiKey });
        
        const prompt = `You are an expert phonetician and pronunciation coach. 
        The user is practicing the phoneme /${activePhoneme.symbol}/ in the word "${activePhoneme.word}".
        Listen to the audio and analyze their pronunciation.
        
        Provide:
        1. An overall score (0-100).
        2. Prescriptive articulatory feedback. Compare their pronunciation to the target sound. Offer specific advice on tongue position (height/backness), lip rounding, and jaw openness needed to improve.
        3. A phoneme segmentation analysis: break down the word into its constituent phonemes, and provide an observation for each segment to help the user understand their timing and articulation.`;

        // We use the base mimeType without codecs for the API (e.g., 'audio/webm;codecs=opus' -> 'audio/webm')
        const cleanMimeType = mimeType.split(';')[0];

        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: {
            parts: [
              { inlineData: { mimeType: cleanMimeType, data: base64data } },
              { text: prompt }
            ]
          },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                overallScore: { type: Type.NUMBER, description: "Score from 0 to 100" },
                prescriptiveFeedback: { type: Type.STRING, description: "Specific advice on tongue, lip, and jaw adjustments." },
                segmentation: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      phoneme: { type: Type.STRING },
                      observation: { type: Type.STRING }
                    }
                  }
                }
              },
              required: ["overallScore", "prescriptiveFeedback", "segmentation"]
            }
          }
        });

        if (response.text) {
          setAiResult(JSON.parse(response.text));
        }
      };
    } catch (error) {
      console.error("Error analyzing audio:", error);
      alert("An error occurred during AI analysis. Please try again.");
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
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ word: customWord })
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || "Failed to analyze word. Please try again.");
        return;
      }

      // Update the active phoneme with the new custom data
      setActivePhoneme({
        symbol: data.symbol,
        word: customWord,
        f1: data.f1,
        f2: data.f2,
        description: data.description,
        somatosensoryCue: data.somatosensoryCue
      });

      // Set the custom data (syllables, intonation)
      setCustomWordData({
        syllables: data.syllables,
        intonation: data.intonation
      });

    } catch (error) {
      console.error("Error analyzing custom word:", error);
      alert("An unexpected error occurred. Please try again.");
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
        const duration = isStressed ? 0.4 : 0.2;
        const freq = isStressed ? 330 : 220; // E4 (stressed) vs A3 (unstressed)

        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(freq, startTime);

        // Smooth envelope
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.05);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.start(startTime);
        oscillator.stop(startTime + duration);

        startTime += duration + 0.05; // Gap between syllables
      });
    } catch (e) {
      console.error("Could not play intonation", e);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: Controls & Target */}
      <div className="lg:col-span-4 space-y-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          {/* Gamification Scoreboard */}
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <span className="font-bold text-slate-700">Score: {score}</span>
            </div>
            <div className="text-sm font-medium text-slate-500">
              Active Time: {Math.floor(activeTime / 60)}:{(Math.floor(activeTime % 60)).toString().padStart(2, '0')}
            </div>
          </div>

          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-slate-800">Target Sound</h2>
            <button 
              onClick={() => setDebugMode(!debugMode)}
              className={`p-2 rounded-lg transition-colors ${debugMode ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400 hover:bg-slate-100'}`}
              title="Toggle Debug Sliders"
            >
              <Settings2 className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex flex-col items-center justify-center py-8 bg-slate-50 rounded-xl border border-slate-100 mb-6">
            <div className="text-6xl font-serif text-indigo-600 mb-2">/{activePhoneme.symbol}/</div>
            <div className="text-slate-500 font-medium flex items-center gap-2">
              as in <span className="text-slate-800 font-bold">&quot;{activePhoneme.word}&quot;</span>
            </div>

            {activePhoneme.somatosensoryCue && (
               <div className="mt-4 px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-lg text-sm text-indigo-800 text-center max-w-sm">
                 <span className="font-semibold block mb-1">Feel it here:</span>
                 {activePhoneme.somatosensoryCue}
               </div>
            )}

            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={playNativeExample}
                disabled={isPlayingNative || isRecording}
                className={`px-4 py-2 rounded-full flex items-center gap-2 text-sm font-medium transition-colors ${
                  isPlayingNative
                    ? 'bg-indigo-100 text-indigo-700 cursor-not-allowed'
                    : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 hover:text-indigo-800'
                }`}
              >
                <Volume2 className="w-4 h-4" />
                {isPlayingNative ? 'Playing...' : 'Play Native Example'}
              </button>

              <button
                onClick={startGlideMode}
                disabled={isGlideMode || isRecording}
                className={`px-4 py-2 rounded-full flex items-center gap-2 text-sm font-medium transition-colors ${
                  isGlideMode
                    ? 'bg-purple-100 text-purple-700 cursor-not-allowed'
                    : 'bg-purple-50 text-purple-600 hover:bg-purple-100 hover:text-purple-800'
                }`}
              >
                <RefreshCw className={`w-4 h-4 ${isGlideMode ? 'animate-spin' : ''}`} />
                {isGlideMode ? 'Gliding...' : 'Anchor & Glide'}
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3 bg-rose-50 border border-rose-100 p-3 rounded-xl">
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-rose-800">Over-Exaggeration Mode</h4>
                <p className="text-xs text-rose-600">Forces you to stretch past the target to break habits.</p>
              </div>
              <button
                onClick={() => setIsExaggerateMode(!isExaggerateMode)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isExaggerateMode ? 'bg-rose-500' : 'bg-slate-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isExaggerateMode ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            <p className="text-xs text-slate-400 mt-4 text-center px-4">
              {activePhoneme.description}
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider">Minimal Pairs Library</h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {MINIMAL_PAIRS.map(pair => (
                <button
                  key={pair.id}
                  onClick={() => {
                    setActivePair(pair);
                    setActivePhoneme(pair.phonemes[0]);
                  }}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    activePair.id === pair.id 
                      ? 'bg-slate-800 text-white' 
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {pair.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {activePair.phonemes.map(p => (
                <button
                  key={p.symbol}
                  onClick={() => {
                    setActivePhoneme(p);
                    setCustomWordData(null); // Clear custom data when picking a standard pair
                    if (!isRecording && !debugMode) {
                      setCurrentF1(p.f1 + (Math.random() > 0.5 ? 200 : -200));
                      setCurrentF2(p.f2 + (Math.random() > 0.5 ? 400 : -400));
                    }
                  }}
                  className={`py-3 rounded-xl font-serif text-xl transition-all ${
                    activePhoneme.symbol === p.symbol 
                      ? 'bg-indigo-600 text-white shadow-md' 
                      : 'bg-white border border-slate-200 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50'
                  }`}
                >
                  /{p.symbol}/
                </button>
              ))}
            </div>

            {/* Custom Word Entry */}
            <div className="mt-6 border-t border-slate-100 pt-6">
              <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-3">Or Analyze a Custom Word</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. phenomenal"
                  value={customWord}
                  onChange={(e) => setCustomWord(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  onKeyDown={(e) => e.key === 'Enter' && analyzeCustomWord()}
                />
                <button
                  onClick={analyzeCustomWord}
                  disabled={isAnalyzingCustomWord || !customWord.trim()}
                  className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-medium hover:bg-slate-900 disabled:opacity-50 flex items-center justify-center min-w-[80px]"
                >
                  {isAnalyzingCustomWord ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Analyze'}
                </button>
              </div>
            </div>

            {/* Syllable and Intonation Display for Custom Word */}
            {customWordData && (
              <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">Structure & Rhythm</h4>
                <div className="flex flex-wrap gap-2 mb-3">
                  {customWordData.syllables.map((syl, i) => (
                    <span key={i} className="px-2 py-1 bg-white border border-slate-200 rounded text-slate-700 text-sm font-medium shadow-sm">
                      {syl}
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
                    {customWordData.intonation}
                  </div>
                  <button
                    onClick={playIntonationHum}
                    className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg hover:bg-indigo-200 transition-colors"
                    title="Play Intonation Melody"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Practice</h2>
          
          <button
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isAnalyzing}
            className={`w-full py-4 rounded-xl flex items-center justify-center gap-3 font-medium text-lg transition-all ${
              isRecording 
                ? 'bg-red-50 text-red-600 border border-red-200 shadow-inner' 
                : isAnalyzing
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                  : 'bg-indigo-600 text-white shadow-md hover:bg-indigo-700'
            }`}
          >
            {isRecording ? (
              <>
                <div className="animate-pulse">
                  <MicOff className="w-6 h-6" />
                </div>
                Stop Recording
              </>
            ) : isAnalyzing ? (
              <>
                <RefreshCw className="w-6 h-6 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Mic className="w-6 h-6" />
                Start Recording
              </>
            )}
          </button>

          {/* Audio Waveform Visualizer */}
          <div className="mt-6">
            <WaveformVisualizer stream={mediaStream} isRecording={isRecording} />
          </div>

          {debugMode && (
            <div className="mt-6 space-y-4 p-4 bg-amber-50 rounded-xl border border-amber-200">
              <h3 className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                <Settings2 className="w-4 h-4" /> Debug Controls
              </h3>
              <div>
                <label className="text-xs font-medium text-amber-700 flex justify-between">
                  <span>F1 (Jaw Height)</span>
                  <span>{Math.round(currentF1)} Hz</span>
                </label>
                <input 
                  type="range" min="200" max="1000" 
                  value={currentF1} onChange={e => setCurrentF1(Number(e.target.value))}
                  className="w-full accent-amber-600"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-amber-700 flex justify-between">
                  <span>F2 (Tongue Backness)</span>
                  <span>{Math.round(currentF2)} Hz</span>
                </label>
                <input 
                  type="range" min="600" max="2500" 
                  value={currentF2} onChange={e => setCurrentF2(Number(e.target.value))}
                  className="w-full accent-amber-600"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Visualizations & AI Feedback */}
      <div className="lg:col-span-8 space-y-6">
        {/* Real-time Feedback Banner */}
        <div className={`p-4 rounded-xl border flex items-start gap-4 transition-colors relative overflow-hidden ${
          isLockedIn
            ? 'bg-green-100 border-green-400 text-green-900 shadow-inner'
            : feedback.includes('Excellent')
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : isRecording || debugMode
                ? 'bg-blue-50 border-blue-200 text-blue-800'
                : 'bg-slate-50 border-slate-200 text-slate-600'
        }`}>
          {/* Lock-in Progress Bar */}
          {(isRecording || debugMode) && feedback.includes('Excellent') && !isLockedIn && (
             <div
               className="absolute bottom-0 left-0 h-1 bg-emerald-400 transition-all duration-100 ease-linear"
               style={{ width: `${Math.min(100, (lockInTime / 3) * 100)}%` }}
             />
          )}

          <div className={`p-2 rounded-full relative z-10 ${
            isLockedIn ? 'bg-green-200' : feedback.includes('Excellent') ? 'bg-emerald-100' : isRecording || debugMode ? 'bg-blue-100' : 'bg-slate-200'
          }`}>
            <Activity className={`w-5 h-5 ${isRecording && !feedback.includes('Excellent') ? 'animate-pulse' : ''} ${isLockedIn ? 'animate-bounce text-green-600' : ''}`} />
          </div>
          <div className="relative z-10 flex-1">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold mb-1">
                {isLockedIn ? "Perfect Lock-In! +50 Points" : "Real-time Formant Feedback"}
              </h3>
              {feedback.includes('Excellent') && !isLockedIn && (
                 <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full animate-pulse">
                   Hold: {Math.max(0, 3 - lockInTime).toFixed(1)}s
                 </span>
              )}
            </div>
            <p className="text-sm opacity-90">{isLockedIn ? "Awesome muscle control!" : feedback}</p>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 2D Cross Section */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">2D Cross-Section</h2>
            <div className="flex-1 min-h-[300px] relative flex items-center justify-center bg-slate-50 rounded-xl overflow-hidden border border-slate-100">
              <VocalTract2D
                f1={currentF1}
                f2={currentF2}
                targetF1={displayTarget.f1}
                targetF2={displayTarget.f2}
                isActive={isRecording || debugMode || isPlayingNative}
              />
            </div>
            <p className="text-xs text-slate-400 mt-4 text-center">
              Anatomical side profile of the tongue position.
            </p>
          </div>

          {/* 3D Vocal Tract */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">3D Articulatory Mesh</h2>
            <div className="flex-1 min-h-[300px] relative flex items-center justify-center bg-slate-50 rounded-xl overflow-hidden border border-slate-100">
              <VocalTract 
                f1={currentF1} 
                f2={currentF2} 
                targetF1={displayTarget.f1}
                targetF2={displayTarget.f2}
                isActive={isRecording || debugMode || isPlayingNative}
              />
            </div>
            <p className="text-xs text-slate-400 mt-4 text-center">
              Organic deformation of the tongue surface based on formants.
            </p>
          </div>

          {/* Vowel Quadrilateral */}
          <div className="md:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Acoustic Space (F1/F2)</h2>
            <div className="flex-1 min-h-[300px] relative">
              <VowelQuadrilateral
                targetF1={displayTarget.f1}
                targetF2={displayTarget.f2}
                currentF1={currentF1}
                currentF2={currentF2}
                isActive={isRecording || debugMode || isPlayingNative}
              />
            </div>
            <p className="text-xs text-slate-400 mt-4 text-center">
              F1 (vertical) correlates with jaw openness. F2 (horizontal) correlates with tongue advancement.
            </p>
          </div>
        </div>

        {/* AI Analysis Results */}
        {isAnalyzing && (
          <div className="bg-indigo-50 rounded-2xl p-6 border border-indigo-100 flex items-center justify-center gap-3 shadow-sm">
            <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin" />
            <span className="text-indigo-800 font-medium">AI Speech Engine analyzing pronunciation and segmenting phonemes...</span>
          </div>
        )}

        {aiResult && !isAnalyzing && (
          <div 
            className="bg-white rounded-2xl p-6 shadow-sm border border-emerald-200 space-y-6 transition-all duration-500"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-emerald-500" />
                AI Speech Analysis
              </h2>
              <div className="flex items-center gap-2 bg-emerald-50 px-4 py-2 rounded-full border border-emerald-100">
                <span className="text-sm font-semibold text-emerald-800">Score:</span>
                <span className="text-lg font-bold text-emerald-600">{aiResult.overallScore}/100</span>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">Prescriptive Feedback</h3>
              <p className="text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100 text-lg">
                {aiResult.prescriptiveFeedback}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Phoneme Segmentation Module</h3>
              <div className="space-y-3">
                {aiResult.segmentation.map((seg: any, idx: number) => (
                  <div key={idx} className="flex gap-4 items-start p-4 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                    <div className="w-14 h-14 shrink-0 bg-indigo-100 text-indigo-700 font-serif text-2xl rounded-xl flex items-center justify-center font-bold shadow-sm">
                      /{seg.phoneme}/
                    </div>
                    <div className="pt-1">
                      <p className="text-slate-700 font-medium">{seg.observation}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
