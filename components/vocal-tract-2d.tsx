'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

interface VocalTract2DProps {
  f1Ref: React.RefObject<number>;
  f2Ref: React.RefObject<number>;
  targetF1: number;
  targetF2: number;
  isActive: boolean;
}

export function VocalTract2D({ f1Ref, f2Ref, targetF1, targetF2, isActive }: VocalTract2DProps) {
  const currentTongueRef = useRef<SVGPathElement>(null);
  const targetTongueRef = useRef<SVGPathElement>(null);

  // Neutral position
  const neutralPath = "M 20,90 Q 50,90 80,90 Q 90,80 90,50 L 100,100 Z";

  // Calculate path string based on f1/f2
  const calculatePath = (currentF1: number, currentF2: number) => {
    // Map F1 (200-1000) to height (y: 30-90)
    // Low F1 = high tongue (low y value)
    const heightY = 90 - (Math.max(0, Math.min(1, (1000 - currentF1) / 800))) * 60;

    // Map F2 (600-2500) to backness (x: 40-80)
    // Low F2 = back tongue (high x value)
    const backnessX = 80 - (Math.max(0, Math.min(1, (2500 - currentF2) / 1900))) * 40;

    // We construct a bezier curve that represents a side profile of the tongue
    return `M 20,90 Q ${backnessX},${heightY} 80,90 Q 90,80 90,50 L 100,100 Z`;
  };

  useEffect(() => {
    if (targetTongueRef.current) {
       targetTongueRef.current.setAttribute('d', calculatePath(targetF1, targetF2));
    }
  }, [targetF1, targetF2]);

  const currentJawRef = useRef<SVGGElement>(null);

  // Map F1 to jaw drop distance (0 to 15 units of extra drop)
  const calculateJawDrop = (currentF1: number) => {
    // Low F1 (e.g. 300) = jaw closed = 0 drop
    // High F1 (e.g. 800) = jaw open = 15 drop
    return Math.max(0, Math.min(15, ((currentF1 - 200) / 600) * 15));
  };

  useEffect(() => {
    let animationFrameId: number;

    const renderLoop = () => {
      if (currentTongueRef.current && currentJawRef.current) {
        if (isActive) {
          // While active, we render directly for low-latency 60fps response
          const displayF1 = f1Ref.current || 500;
          const displayF2 = f2Ref.current || 1500;

          const newPath = calculatePath(displayF1, displayF2);
          const jawDrop = calculateJawDrop(displayF1);

          currentTongueRef.current.setAttribute('d', newPath);
          currentJawRef.current.setAttribute('transform', `translate(0, ${jawDrop})`);

          animationFrameId = requestAnimationFrame(renderLoop);
        } else {
          // When inactive, we use GSAP to smoothly animate back to the resting state.
          const newPath = calculatePath(600, 1500);
          const jawDrop = calculateJawDrop(600);

          gsap.to(currentTongueRef.current, {
            attr: { d: newPath },
            duration: 0.8,
            ease: "elastic.out(1, 0.5)",
          });

          gsap.to(currentJawRef.current, {
            y: jawDrop,
            duration: 0.8,
            ease: "elastic.out(1, 0.5)",
          });
        }
      }
    };

    if (isActive) {
      renderLoop();
    } else {
      // Trigger the inactive return animation immediately when state changes
      renderLoop();
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [isActive, f1Ref, f2Ref]);

  return (
    <div className="w-full h-full relative bg-slate-50 flex items-center justify-center p-4">
      <svg viewBox="0 0 100 100" className="w-full h-full max-w-sm drop-shadow-sm">
        <defs>
          <linearGradient id="palateGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#cbd5e1" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>
          <linearGradient id="tongueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
        </defs>

        {/* Palate / Roof of mouth (Static) */}
        <path
          d="M 10,50 Q 20,20 50,20 Q 80,20 90,40 L 100,0 L 0,0 Z"
          fill="url(#palateGradient)"
          className="opacity-50"
        />

        {/* Upper Teeth (Static) */}
        <path d="M 90,40 L 95,45 L 85,45 Z" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />

        {/* Target Tongue (Ghost) */}
        <path
          ref={targetTongueRef}
          d={neutralPath}
          fill="none"
          stroke="#6366f1"
          strokeWidth="2"
          strokeDasharray="4 2"
          className="opacity-60"
        />

        {/* Current Tongue */}
        <path
          ref={currentTongueRef}
          d={neutralPath}
          fill="url(#tongueGradient)"
          className="opacity-90"
        />

        {/* Lower Jaw & Teeth (Animates based on F1) */}
        <g ref={currentJawRef}>
          {/* Lower Lip / Chin line */}
          <path d="M 100,100 L 90,60 Q 90,55 95,50 Z" fill="#94a3b8" className="opacity-20" />
          {/* Lower Teeth */}
          <path d="M 90,50 L 95,45 L 85,45 Z" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" transform="translate(0, 5)" />
        </g>
      </svg>
    </div>
  );
}
