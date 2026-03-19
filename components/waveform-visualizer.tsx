'use client';
import { useEffect, useRef } from 'react';

export function WaveformVisualizer({ stream, isRecording }: { stream: MediaStream | null, isRecording: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!stream || !isRecording) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const audioCtx = audioCtxRef.current;
    
    // Resume context if suspended (browser policy)
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    analyserRef.current = analyser;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      analyser.getByteTimeDomainData(dataArray);

      ctx.fillStyle = 'rgb(248, 250, 252)'; // slate-50
      ctx.fillRect(0, 0, width, height);

      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgb(99, 102, 241)'; // indigo-500
      ctx.beginPath();

      const sliceWidth = width * 1.0 / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * height / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      source.disconnect();
    };
  }, [stream, isRecording]);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Audio Input Signal</span>
        {isRecording && <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>}
      </div>
      <canvas
        ref={canvasRef}
        width={400}
        height={80}
        className="w-full h-20 rounded-lg border border-slate-200 bg-slate-50"
      />
    </div>
  );
}
