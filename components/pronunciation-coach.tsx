'use client';

import { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Settings2, RefreshCw, Volume2, Sparkles, Activity } from 'lucide-react';
import { VowelQuadrilateral } from './vowel-quadrilateral';
import { VocalTract } from './vocal-tract';
import { WaveformVisualizer } from './waveform-visualizer';
import { GoogleGenAI, Type } from '@google/genai';

// Define the 10 target phonemes grouped by minimal pairs
export const MINIMAL_PAIRS = [
  {
    id: 'i-I',
    label: '/iː/ vs /ɪ/',
    phonemes: [
      { symbol: 'iː', word: 'fleece', f1: 300, f2: 2200, description: 'High front, unrounded. Tongue tense and forward.' },
      { symbol: 'ɪ', word: 'kit', f1: 400, f2: 1800, description: 'Mid-high front, unrounded. Tongue relaxed.' },
    ]
  },
  {
    id: 'ae-v',
    label: '/æ/ vs /ʌ/',
    phonemes: [
      { symbol: 'æ', word: 'trap', f1: 700, f2: 1600, description: 'Low front, unrounded. Jaw open.' },
      { symbol: 'ʌ', word: 'strut', f1: 600, f2: 1200, description: 'Mid-low central, unrounded. Jaw relaxed.' },
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
  const [activePhoneme, setActivePhoneme] = useState(MINIMAL_PAIRS[0].phonemes[0]);
  
  const [isRecording, setIsRecording] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  // Audio Recording State
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  // Real-time Audio Analysis Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // AI Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);

  // Current estimated formants (simulated or debug)
  const [currentF1, setCurrentF1] = useState(500);
  const [currentF2, setCurrentF2] = useState(1500);

  // Simulation loop for "recording" mode (visuals only)
  useEffect(() => {
    let animationFrameId: number;
    
    if (isRecording && !debugMode && analyserRef.current && audioCtxRef.current) {
      const analyser = analyserRef.current;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const sampleRate = audioCtxRef.current.sampleRate;
      const binWidth = (sampleRate / 2) / bufferLength;

      const f1MinBin = Math.floor(200 / binWidth);
      const f1MaxBin = Math.ceil(1000 / binWidth);
      const f2MinBin = Math.floor(1000 / binWidth);
      const f2MaxBin = Math.ceil(2500 / binWidth);

      const analyzeAudio = () => {
        analyser.getByteFrequencyData(dataArray);

        // Calculate volume
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        const avgVolume = sum / bufferLength;

        if (avgVolume > 5) { // User is speaking
          setIsSpeaking(true);
          
          // Find F1 peak
          let maxF1Val = 0;
          let maxF1Bin = f1MinBin;
          for (let i = f1MinBin; i <= f1MaxBin; i++) {
            if (dataArray[i] > maxF1Val) { maxF1Val = dataArray[i]; maxF1Bin = i; }
          }
          
          // Find F2 peak
          let maxF2Val = 0;
          let maxF2Bin = f2MinBin;
          for (let i = f2MinBin; i <= f2MaxBin; i++) {
            if (dataArray[i] > maxF2Val) { maxF2Val = dataArray[i]; maxF2Bin = i; }
          }

          const targetF1Raw = maxF1Bin * binWidth;
          const targetF2Raw = maxF2Bin * binWidth;

          // Smooth the values heavily
          setCurrentF1(prev => prev * 0.85 + targetF1Raw * 0.15);
          setCurrentF2(prev => prev * 0.85 + targetF2Raw * 0.15);
        } else {
          setIsSpeaking(false);
          // Drift back to neutral position if quiet
          setCurrentF1(prev => prev * 0.95 + 500 * 0.05);
          setCurrentF2(prev => prev * 0.95 + 1500 * 0.05);
        }
        
        animationFrameId = requestAnimationFrame(analyzeAudio);
      };
      
      analyzeAudio();
    }
    
    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [isRecording, debugMode]);

  // Generate real-time feedback based on current formants vs target
  let feedback = 'Press record and speak the word to start practicing.';
  if (debugMode) {
    const f1Diff = currentF1 - activePhoneme.f1;
    const f2Diff = currentF2 - activePhoneme.f2;
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
      const f1Diff = currentF1 - activePhoneme.f1;
      const f2Diff = currentF2 - activePhoneme.f2;
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
      
      // Set up real-time analysis
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      
      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;
      sourceRef.current = source;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Clean up audio context
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: Controls & Target */}
      <div className="lg:col-span-4 space-y-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
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
              <button className="text-indigo-500 hover:text-indigo-700 transition-colors">
                <Volume2 className="w-4 h-4" />
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
        <div className={`p-4 rounded-xl border flex items-start gap-4 transition-colors ${
          feedback.includes('Excellent') 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
            : isRecording || debugMode
              ? 'bg-blue-50 border-blue-200 text-blue-800'
              : 'bg-slate-50 border-slate-200 text-slate-600'
        }`}>
          <div className={`p-2 rounded-full ${
            feedback.includes('Excellent') ? 'bg-emerald-100' : isRecording || debugMode ? 'bg-blue-100' : 'bg-slate-200'
          }`}>
            <Activity className={`w-5 h-5 ${isRecording && !feedback.includes('Excellent') ? 'animate-pulse' : ''}`} />
          </div>
          <div>
            <h3 className="font-semibold mb-1">Real-time Formant Feedback</h3>
            <p className="text-sm opacity-90">{feedback}</p>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Vowel Quadrilateral */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Acoustic Space (F1/F2)</h2>
            <div className="flex-1 min-h-[300px] relative">
              <VowelQuadrilateral 
                targetF1={activePhoneme.f1} 
                targetF2={activePhoneme.f2}
                currentF1={currentF1}
                currentF2={currentF2}
                isActive={isRecording || debugMode}
              />
            </div>
            <p className="text-xs text-slate-400 mt-4 text-center">
              F1 (vertical) correlates with jaw openness. F2 (horizontal) correlates with tongue advancement.
            </p>
          </div>

          {/* Vocal Tract */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">Articulatory Estimation</h2>
            <div className="flex-1 min-h-[300px] relative flex items-center justify-center bg-slate-50 rounded-xl overflow-hidden border border-slate-100">
              <VocalTract 
                f1={currentF1} 
                f2={currentF2} 
                targetF1={activePhoneme.f1}
                targetF2={activePhoneme.f2}
                isActive={isRecording || debugMode}
              />
            </div>
            <p className="text-xs text-slate-400 mt-4 text-center">
              Estimated tongue position based on formant frequencies.
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
