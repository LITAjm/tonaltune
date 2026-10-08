'use client';

import { useEffect, useRef, useState } from 'react';
import { PitchDetector } from '@/lib/pitch-detector';

interface WaveformVisualizerProps {
  stream: MediaStream | null;
  analyserNode?: AnalyserNode | null;
  isRecording: boolean;
  f1Ref?: React.RefObject<number>;
  f2Ref?: React.RefObject<number>;
  f3Ref?: React.RefObject<number>;
}

export function WaveformVisualizer({
  stream,
  analyserNode,
  isRecording,
  f1Ref,
  f2Ref,
  f3Ref
}: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewMode, setViewMode] = useState<'combined' | 'pitch' | 'spectrum' | 'wave'>('combined');

  // Historical Pitch Contour Buffer for Intonation Display
  const pitchHistoryRef = useRef<number[]>([]);
  const pitchDetectorRef = useRef<PitchDetector>(new PitchDetector(2048));

  useEffect(() => {
    if (!isRecording || (!stream && !analyserNode)) {
      pitchHistoryRef.current = [];
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let internalAudioCtx: AudioContext | null = null;
    let activeAnalyser = analyserNode;

    if (!activeAnalyser && stream) {
      internalAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (internalAudioCtx.state === 'suspended') {
        internalAudioCtx.resume();
      }
      activeAnalyser = internalAudioCtx.createAnalyser();
      activeAnalyser.fftSize = 2048;
      const source = internalAudioCtx.createMediaStreamSource(stream);
      source.connect(activeAnalyser);
    }

    if (!activeAnalyser) return;

    const bufferLength = activeAnalyser.frequencyBinCount;
    const timeDomainArray = new Uint8Array(bufferLength);
    const freqDomainArray = new Uint8Array(bufferLength);
    const sampleRate = activeAnalyser.context?.sampleRate || 48000;

    let animationFrameId: number;

    const draw = () => {
      if (!activeAnalyser) return;
      const width = canvas.width;
      const height = canvas.height;

      activeAnalyser.getByteTimeDomainData(timeDomainArray);
      activeAnalyser.getByteFrequencyData(freqDomainArray);

      // 1. Detect Real-Time Pitch (F0) & Voicing
      const pitchResult = pitchDetectorRef.current.getPitch(timeDomainArray, sampleRate);
      if (pitchResult.isVoiced) {
        pitchHistoryRef.current.push(pitchResult.pitch);
      } else {
        pitchHistoryRef.current.push(0);
      }

      if (pitchHistoryRef.current.length > 180) {
        pitchHistoryRef.current.shift();
      }

      // Background
      ctx.fillStyle = '#090d16'; // Deep slate
      ctx.fillRect(0, 0, width, height);

      // Center Reference Line
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // --- VIEW MODE 1: FREQUENCY SPECTRUM (FFT) ---
      if (viewMode === 'combined' || viewMode === 'spectrum') {
        const numBars = 100;
        const barWidth = width / numBars;
        let x = 0;

        for (let i = 0; i < numBars; i++) {
          const val = freqDomainArray[i * 2];
          const barH = (val / 255) * (height * 0.82);

          const grad = ctx.createLinearGradient(0, height, 0, height - barH);
          grad.addColorStop(0, 'rgba(99, 102, 241, 0.15)'); // indigo
          grad.addColorStop(1, 'rgba(52, 211, 153, 0.65)'); // emerald

          ctx.fillStyle = grad;
          ctx.fillRect(x, height - barH, barWidth - 1, barH);
          x += barWidth;
        }

        // Formant Resonance Markers
        if (f1Ref && f2Ref) {
          const f1 = f1Ref.current || 500;
          const f2 = f2Ref.current || 1500;
          const nyquist = sampleRate / 2;
          const maxDisplayedFreq = (numBars * 2 / bufferLength) * nyquist;

          const f1X = (f1 / maxDisplayedFreq) * width;
          const f2X = (f2 / maxDisplayedFreq) * width;

          if (f1X > 0 && f1X < width) {
            ctx.fillStyle = '#f43f5e'; // rose
            ctx.font = 'bold 9px sans-serif';
            ctx.fillText(`F1 ${Math.round(f1)}Hz`, Math.max(4, f1X - 16), 14);
          }

          if (f2X > 0 && f2X < width) {
            ctx.fillStyle = '#a855f7'; // purple
            ctx.font = 'bold 9px sans-serif';
            ctx.fillText(`F2 ${Math.round(f2)}Hz`, Math.max(4, f2X - 16), 26);
          }
        }
      }

      // --- VIEW MODE 2: OSCILLOSCOPE WAVEFORM ---
      if (viewMode === 'combined' || viewMode === 'wave') {
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = '#38bdf8'; // sky blue
        ctx.beginPath();

        const sliceWidth = width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = timeDomainArray[i] / 128.0;
          const y = (v * height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }

        ctx.lineTo(width, height / 2);
        ctx.stroke();
      }

      // --- VIEW MODE 3: PITCH (F0) & INTONATION CONTOUR ---
      if (viewMode === 'pitch' || viewMode === 'combined') {
        const history = pitchHistoryRef.current;
        if (history.length > 1) {
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = '#fbbf24'; // Amber pitch line
          ctx.beginPath();

          const step = width / 180;
          let started = false;

          for (let i = 0; i < history.length; i++) {
            const p = history[i];
            const px = i * step;

            if (p > 70 && p < 450) {
              const py = height - ((p - 80) / (400 - 80)) * height;
              if (!started) {
                ctx.moveTo(px, py);
                started = true;
              } else {
                ctx.lineTo(px, py);
              }
            } else {
              started = false;
            }
          }
          ctx.stroke();
        }
      }

      // Live Pitch / Note Canvas HUD Tag
      if (pitchResult.isVoiced && pitchResult.pitch > 0) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
        ctx.fillRect(width - 110, 6, 104, 20);
        ctx.strokeStyle = '#f59e0b';
        ctx.strokeRect(width - 110, 6, 104, 20);

        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText(`F0: ${pitchResult.pitch}Hz (${pitchResult.note})`, width - 104, 20);
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (internalAudioCtx) {
        internalAudioCtx.close();
      }
    };
  }, [stream, analyserNode, isRecording, viewMode, f1Ref, f2Ref, f3Ref]);

  return (
    <div className="w-full bg-slate-900 p-3 rounded-xl border border-slate-800 shadow-inner select-none">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isRecording ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
            Acoustic Signal, FFT & Pitch
          </span>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 bg-slate-800 p-0.5 rounded-lg border border-slate-700">
          <button
            onClick={() => setViewMode('combined')}
            className={`px-2 py-0.5 text-[10px] font-medium rounded transition ${
              viewMode === 'combined' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setViewMode('pitch')}
            className={`px-2 py-0.5 text-[10px] font-medium rounded transition ${
              viewMode === 'pitch' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Pitch (F0)
          </button>
          <button
            onClick={() => setViewMode('spectrum')}
            className={`px-2 py-0.5 text-[10px] font-medium rounded transition ${
              viewMode === 'spectrum' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            FFT
          </button>
          <button
            onClick={() => setViewMode('wave')}
            className={`px-2 py-0.5 text-[10px] font-medium rounded transition ${
              viewMode === 'wave' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Oscilloscope
          </button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={480}
        height={95}
        className="w-full h-24 rounded-lg bg-slate-950 border border-slate-800 block"
      />
    </div>
  );
}
