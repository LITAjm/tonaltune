'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';

interface VowelQuadrilateralProps {
  targetF1: number;
  targetF2: number;
  f1Ref: React.RefObject<number>;
  f2Ref: React.RefObject<number>;
  isActive: boolean;
}

export function VowelQuadrilateral({ targetF1, targetF2, f1Ref, f2Ref, isActive }: VowelQuadrilateralProps) {
  const dotRef = useRef<SVGCircleElement>(null);
  const lineRef = useRef<SVGLineElement>(null);
  const pulseRef = useRef<SVGCircleElement>(null);

  const F1_MIN = 200;
  const F1_MAX = 1000;
  const F2_MIN = 600;
  const F2_MAX = 2500;

  const mapF1ToY = (f1: number) => ((f1 - F1_MIN) / (F1_MAX - F1_MIN)) * 100;
  const mapF2ToX = (f2: number) => 100 - ((f2 - F2_MIN) / (F2_MAX - F2_MIN)) * 100;

  const targetX = mapF2ToX(targetF2);
  const targetY = mapF1ToY(targetF1);
  
  useEffect(() => {
    let animationFrameId: number;

    const renderLoop = () => {
      if (isActive && dotRef.current) {
        const currentF1 = f1Ref.current || 500;
        const currentF2 = f2Ref.current || 1500;

        const currentX = mapF2ToX(currentF2);
        const currentY = mapF1ToY(currentF1);

        // Update attributes directly in render loop for low latency
        dotRef.current.setAttribute('cx', `${currentX}%`);
        dotRef.current.setAttribute('cy', `${currentY}%`);

        if (pulseRef.current) {
          pulseRef.current.setAttribute('cx', `${currentX}%`);
          pulseRef.current.setAttribute('cy', `${currentY}%`);
        }

        if (lineRef.current) {
          lineRef.current.setAttribute('x2', `${currentX}%`);
          lineRef.current.setAttribute('y2', `${currentY}%`);
        }
      }
      animationFrameId = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => cancelAnimationFrame(animationFrameId);
  }, [isActive, f1Ref, f2Ref]);

  // Pulse animation loop
  useEffect(() => {
    if (pulseRef.current && isActive) {
      const tl = gsap.timeline({ repeat: -1 });
      tl.fromTo(pulseRef.current, 
        { attr: { r: 4 }, opacity: 0.8 },
        { attr: { r: 20 }, opacity: 0, duration: 1.5, ease: "power1.out" }
      );
      return () => { tl.kill(); };
    }
  }, [isActive]);

  return (
    <div className="w-full h-full relative bg-slate-900 rounded-xl overflow-hidden">
      {/* Flexible Vector Grid */}
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        <defs>
          <pattern id="grid" width="10%" height="10%" patternUnits="userSpaceOnUse">
            <path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(99, 102, 241, 0.15)" strokeWidth="1"/>
          </pattern>
          {/* Subtle glow for the mouth profile */}
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        
        {/* Stylized Mouth Profile (Facing Left) */}
        <path 
          d="M 10,50 C 30,15 85,10 95,10 L 95,90 C 85,90 30,85 10,50 Z" 
          fill="rgba(99, 102, 241, 0.03)" 
          stroke="rgba(99, 102, 241, 0.2)" 
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          filter="url(#glow)"
        />

        {/* The Quadrilateral Shape (Acoustic Space) */}
        <polygon 
          points="15%,15% 85%,15% 65%,85% 35%,85%" 
          fill="rgba(99, 102, 241, 0.05)" 
          stroke="rgba(99, 102, 241, 0.3)" 
          strokeWidth="1" 
          strokeDasharray="4 4"
        />

        {/* Target Dot */}
        <circle cx={`${targetX}%`} cy={`${targetY}%`} r="6" fill="none" stroke="#818cf8" strokeWidth="2" strokeDasharray="2 2" />
        <circle cx={`${targetX}%`} cy={`${targetY}%`} r="2" fill="#818cf8" />

        {/* Connection Line */}
        {isActive && (
          <line 
            ref={lineRef}
            x1={`${targetX}%`} y1={`${targetY}%`} 
            x2={`${targetX}%`} y2={`${targetY}%`}
            stroke="rgba(16, 185, 129, 0.5)" 
            strokeWidth="2" 
            strokeDasharray="4 4" 
          />
        )}

        {/* Current Estimation Dot */}
        {isActive && (
          <>
            <circle ref={pulseRef} cx={`${targetX}%`} cy={`${targetY}%`} r="4" fill="#10b981" opacity="0" />
            <circle ref={dotRef} cx={`${targetX}%`} cy={`${targetY}%`} r="5" fill="#10b981" />
          </>
        )}
      </svg>

      {/* Axis Labels - More Intuitive */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] font-bold text-indigo-300/70 uppercase tracking-widest bg-slate-900/50 px-2 py-1 rounded">Roof of Mouth (Closed)</div>
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-bold text-indigo-300/70 uppercase tracking-widest bg-slate-900/50 px-2 py-1 rounded">Jaw Dropped (Open)</div>
      
      <div className="absolute top-1/2 left-2 -translate-y-1/2 -rotate-90 text-[10px] font-bold text-indigo-300/70 uppercase tracking-widest origin-left bg-slate-900/50 px-2 py-1 rounded whitespace-nowrap">Lips / Front</div>
      <div className="absolute top-1/2 right-2 -translate-y-1/2 rotate-90 text-[10px] font-bold text-indigo-300/70 uppercase tracking-widest origin-right bg-slate-900/50 px-2 py-1 rounded whitespace-nowrap">Throat / Back</div>
    </div>
  );
}
