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

// Canonical IPA reference vowels mapped to (F1, F2) coordinates
const IPA_LANDMARKS = [
  { symbol: 'iː', label: 'fleece', f1: 280, f2: 2300 },
  { symbol: 'ɪ', label: 'kit', f1: 390, f2: 1950 },
  { symbol: 'e', label: 'dress', f1: 540, f2: 1850 },
  { symbol: 'æ', label: 'trap', f1: 760, f2: 1680 },
  { symbol: 'ə', label: 'schwa', f1: 500, f2: 1500 },
  { symbol: 'ɜː', label: 'nurse', f1: 520, f2: 1350 },
  { symbol: 'ʌ', label: 'strut', f1: 660, f2: 1250 },
  { symbol: 'uː', label: 'goose', f1: 300, f2: 850 },
  { symbol: 'ʊ', label: 'foot', f1: 440, f2: 1050 },
  { symbol: 'oʊ', label: 'goat', f1: 500, f2: 950 },
  { symbol: 'ɔː', label: 'thought', f1: 600, f2: 850 },
  { symbol: 'ɑː', label: 'palm', f1: 780, f2: 1100 },
];

export function VowelQuadrilateral({ targetF1, targetF2, f1Ref, f2Ref, isActive }: VowelQuadrilateralProps) {
  const dotRef = useRef<SVGCircleElement>(null);
  const pulseRef = useRef<SVGCircleElement>(null);
  const haloRef = useRef<SVGCircleElement>(null);
  const lineRef = useRef<SVGLineElement>(null);
  const trailPathRef = useRef<SVGPathElement>(null);

  // Frequency mapping constants (Hz)
  const F1_MIN = 180;
  const F1_MAX = 900;
  const F2_MIN = 650;
  const F2_MAX = 2500;

  // Safe inner bounding box in 680x360 coordinate space
  const PAD_LEFT = 95;
  const PAD_RIGHT = 590;
  const PAD_TOP = 50;
  const PAD_BOTTOM = 315;

  const mapF1ToY = (f1: number) => {
    const clamped = Math.max(F1_MIN, Math.min(F1_MAX, f1));
    return PAD_TOP + ((clamped - F1_MIN) / (F1_MAX - F1_MIN)) * (PAD_BOTTOM - PAD_TOP);
  };

  const mapF2ToX = (f2: number) => {
    const clamped = Math.max(F2_MIN, Math.min(F2_MAX, f2));
    // Higher F2 is FRONT (Right), Lower F2 is BACK (Left)
    return PAD_LEFT + ((clamped - F2_MIN) / (F2_MAX - F2_MIN)) * (PAD_RIGHT - PAD_LEFT);
  };

  const targetX = mapF2ToX(targetF2);
  const targetY = mapF1ToY(targetF1);

  const trailHistory = useRef<{ x: number; y: number }[]>([]);

  useEffect(() => {
    let animationFrameId: number;

    const renderLoop = () => {
      const currentF1 = f1Ref.current || 500;
      const currentF2 = f2Ref.current || 1500;

      const currentX = mapF2ToX(currentF2);
      const currentY = mapF1ToY(currentF1);

      if (dotRef.current) {
        dotRef.current.setAttribute('cx', `${currentX}`);
        dotRef.current.setAttribute('cy', `${currentY}`);
      }

      if (pulseRef.current) {
        pulseRef.current.setAttribute('cx', `${currentX}`);
        pulseRef.current.setAttribute('cy', `${currentY}`);
      }

      if (haloRef.current) {
        haloRef.current.setAttribute('cx', `${currentX}`);
        haloRef.current.setAttribute('cy', `${currentY}`);
      }

      if (lineRef.current) {
        lineRef.current.setAttribute('x1', `${targetX}`);
        lineRef.current.setAttribute('y1', `${targetY}`);
        lineRef.current.setAttribute('x2', `${currentX}`);
        lineRef.current.setAttribute('y2', `${currentY}`);
      }

      if (isActive) {
        trailHistory.current.push({ x: currentX, y: currentY });
        if (trailHistory.current.length > 24) {
          trailHistory.current.shift();
        }

        if (trailPathRef.current && trailHistory.current.length > 1) {
          const pathString = trailHistory.current.reduce((acc, pt, idx) => {
            return idx === 0 ? `M ${pt.x},${pt.y}` : `${acc} L ${pt.x},${pt.y}`;
          }, '');
          trailPathRef.current.setAttribute('d', pathString);
        }
      } else {
        trailHistory.current = [];
        if (trailPathRef.current) {
          trailPathRef.current.setAttribute('d', '');
        }
      }

      animationFrameId = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => cancelAnimationFrame(animationFrameId);
  }, [isActive, f1Ref, f2Ref, targetX, targetY]);

  // Target pulse animation
  useEffect(() => {
    const pulseElement = document.getElementById('target-pulse-circle');
    if (pulseElement) {
      const tl = gsap.timeline({ repeat: -1 });
      tl.fromTo(
        pulseElement,
        { attr: { r: 8 }, opacity: 0.9 },
        { attr: { r: 28 }, opacity: 0, duration: 1.8, ease: 'power2.out' }
      );
      return () => {
        tl.kill();
      };
    }
  }, [targetX, targetY]);

  return (
    <div className="w-full h-full min-h-[320px] relative bg-slate-950 rounded-xl overflow-hidden p-2 select-none border border-slate-800 shadow-inner flex flex-col items-center justify-center">
      <svg
        className="w-full h-full max-h-[340px]"
        viewBox="0 0 680 360"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <pattern id="quadGridClean" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(148, 163, 184, 0.06)" strokeWidth="0.8" />
          </pattern>

          <filter id="emeraldGlowClean" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          <filter id="indigoGlowClean" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          <linearGradient id="vowelTrailGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        <rect width="680" height="360" fill="url(#quadGridClean)" />

        {/* --- IPA VOWEL TRAPEZOID BOUNDS --- */}
        {/* Front-High (580, 50) -> Back-High (110, 50) -> Back-Low (210, 315) -> Front-Low (500, 315) */}
        <polygon
          points="580,50 110,50 210,315 500,315"
          fill="rgba(99, 102, 241, 0.05)"
          stroke="rgba(99, 102, 241, 0.45)"
          strokeWidth="1.8"
        />

        {/* Close-Mid & Open-Mid horizontal guide lines */}
        <line x1="143" y1="138" x2="553" y2="138" stroke="rgba(148, 163, 184, 0.22)" strokeWidth="1" strokeDasharray="4 4" />
        <line x1="176" y1="226" x2="526" y2="226" stroke="rgba(148, 163, 184, 0.22)" strokeWidth="1" strokeDasharray="4 4" />

        {/* Central vertical vowel guide line */}
        <line x1="345" y1="50" x2="355" y2="315" stroke="rgba(148, 163, 184, 0.22)" strokeWidth="1" strokeDasharray="4 4" />

        {/* --- AXIS LABELS (Padded inside the canvas, zero clipping) --- */}
        {/* Top: High / Closed Jaw */}
        <g transform="translate(345, 24)">
          <rect x="-80" y="-14" width="160" height="20" rx="6" fill="#1e293b" stroke="#334155" strokeWidth="1" />
          <text x="0" y="0" fill="#a5b4fc" fontSize="10" fontWeight="bold" textAnchor="middle" dominantBaseline="middle" letterSpacing="0.08em">
            HIGH / CLOSED JAW (LOW F1)
          </text>
        </g>

        {/* Bottom: Low / Open Jaw */}
        <g transform="translate(355, 342)">
          <rect x="-75" y="-12" width="150" height="20" rx="6" fill="#1e293b" stroke="#334155" strokeWidth="1" />
          <text x="0" y="2" fill="#a5b4fc" fontSize="10" fontWeight="bold" textAnchor="middle" dominantBaseline="middle" letterSpacing="0.08em">
            LOW / OPEN JAW (HIGH F1)
          </text>
        </g>

        {/* Left: Back / Throat */}
        <g transform="translate(36, 180) rotate(-90)">
          <rect x="-65" y="-11" width="130" height="20" rx="6" fill="#1e293b" stroke="#334155" strokeWidth="1" />
          <text x="0" y="3" fill="#a5b4fc" fontSize="9.5" fontWeight="bold" textAnchor="middle" dominantBaseline="middle" letterSpacing="0.08em">
            BACK / THROAT (LOW F2)
          </text>
        </g>

        {/* Right: Front / Lips */}
        <g transform="translate(648, 180) rotate(90)">
          <rect x="-60" y="-11" width="120" height="20" rx="6" fill="#1e293b" stroke="#334155" strokeWidth="1" />
          <text x="0" y="3" fill="#a5b4fc" fontSize="9.5" fontWeight="bold" textAnchor="middle" dominantBaseline="middle" letterSpacing="0.08em">
            FRONT / LIPS (HIGH F2)
          </text>
        </g>

        {/* --- CANONICAL IPA REFERENCE VOWELS --- */}
        {IPA_LANDMARKS.map((landmark) => {
          const lx = mapF2ToX(landmark.f2);
          const ly = mapF1ToY(landmark.f1);
          return (
            <g key={landmark.symbol} className="opacity-70 hover:opacity-100 transition-opacity">
              <circle cx={lx} cy={ly} r="3" fill="#64748b" />
              <text
                x={lx}
                y={ly - 9}
                fill="#cbd5e1"
                fontSize="12.5"
                fontWeight="bold"
                fontFamily="serif"
                textAnchor="middle"
              >
                /{landmark.symbol}/
              </text>
            </g>
          );
        })}

        {/* --- TARGET RADAR PING --- */}
        <circle
          id="target-pulse-circle"
          cx={targetX}
          cy={targetY}
          r="8"
          fill="none"
          stroke="#818cf8"
          strokeWidth="2"
        />
        <circle
          cx={targetX}
          cy={targetY}
          r="12"
          fill="rgba(99, 102, 241, 0.18)"
          stroke="#818cf8"
          strokeWidth="2"
          strokeDasharray="4 3"
          filter="url(#indigoGlowClean)"
        />
        <circle cx={targetX} cy={targetY} r="3.5" fill="#818cf8" />

        {/* Vector Line connecting User and Target */}
        <line
          ref={lineRef}
          x1={targetX}
          y1={targetY}
          x2={targetX}
          y2={targetY}
          stroke="rgba(52, 211, 153, 0.5)"
          strokeWidth="1.8"
          strokeDasharray="4 3"
          opacity={isActive ? 1 : 0}
        />

        {/* Motion Trajectory Trail */}
        <path
          ref={trailPathRef}
          d=""
          fill="none"
          stroke="url(#vowelTrailGrad)"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* --- REAL-TIME LIVE USER FORMANT CURSOR --- */}
        <circle
          ref={haloRef}
          cx={targetX}
          cy={targetY}
          r="16"
          fill="rgba(16, 185, 129, 0.22)"
          opacity={isActive ? 1 : 0}
        />
        <circle
          ref={pulseRef}
          cx={targetX}
          cy={targetY}
          r="9"
          fill="#34d399"
          filter="url(#emeraldGlowClean)"
          opacity={isActive ? 0.95 : 0}
        />
        <circle
          ref={dotRef}
          cx={targetX}
          cy={targetY}
          r="4.5"
          fill="#ffffff"
          opacity={isActive ? 1 : 0}
        />
      </svg>

      {/* Legend Badge */}
      <div className="absolute top-2.5 left-3 flex items-center gap-2 px-3 py-1 bg-slate-900/90 backdrop-blur-md rounded-lg border border-slate-800 text-[11px] font-medium text-slate-300 shadow-sm">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
        Live Formants
        <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 ml-2" />
        Target
      </div>
    </div>
  );
}
