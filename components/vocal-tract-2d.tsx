'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import type { ArticulatoryPlace } from './vocal-tract';

interface VocalTract2DProps {
  f1Ref: React.RefObject<number>;
  f2Ref: React.RefObject<number>;
  targetF1: number;
  targetF2: number;
  targetPlace?: ArticulatoryPlace;
  isActive: boolean;
}

export function VocalTract2D({ f1Ref, f2Ref, targetF1, targetF2, targetPlace = 'vowel', isActive }: VocalTract2DProps) {
  const currentTongueRef = useRef<SVGPathElement>(null);
  const targetTongueRef = useRef<SVGPathElement>(null);
  const currentJawRef = useRef<SVGGElement>(null);
  const upperLipRef = useRef<SVGPathElement>(null);
  const lowerLipRef = useRef<SVGPathElement>(null);
  const constrictionGlowRef = useRef<SVGCircleElement>(null);
  const constrictionTextRef = useRef<SVGTextElement>(null);
  const airflowGroupRef = useRef<SVGGElement>(null);

  const animF1 = useRef(500);
  const animF2 = useRef(1500);

  /**
   * Generates smooth anatomical Bezier path for the tongue cross-section
   * with place-of-articulation gestures (interdental protrusion, alveolar seal, velar contact)
   */
  const calculateTonguePath = (f1: number, f2: number, place: ArticulatoryPlace = 'vowel') => {
    const normF1 = Math.max(0, Math.min(1, (f1 - 200) / 800));
    const normF2 = Math.max(0, Math.min(1, (f2 - 600) / 1900));

    // Tongue Root / Hyoid anchor
    const rootX = 66;
    const rootY = 175;

    const pharynxBackX = 64 - (1 - normF2) * 14;
    const pharynxBackY = 140;

    // Tongue Dorsum
    let dorsumX = 82 + normF2 * 54;
    let dorsumY = 66 + normF1 * 50;

    // Velar Contact Seal (/k, g/)
    if (place === 'velar') {
      dorsumX = 72;
      dorsumY = 48; // Touches soft palate
    }

    // Tongue Blade
    let bladeX = dorsumX + (160 - dorsumX) * 0.55;
    let bladeY = dorsumY + (135 - dorsumY) * 0.45;

    // Tongue Tip
    const jawDrop = normF1 * 18;
    let tipX = 162 + normF2 * 6;
    let tipY = 132 + jawDrop;

    // Interdental Protrusion (/θ, ð/)
    if (place === 'interdental') {
      tipX = 186; // Protrudes right between teeth
      tipY = 104;
      bladeX = 158;
      bladeY = 108;
    }
    // Alveolar Ridge Contact Seal (/t, d, -ed/)
    else if (place === 'alveolar') {
      tipX = 168; // Touches behind upper teeth
      tipY = 76;  // Firm seal on alveolar ridge
      bladeX = 146;
      bladeY = 96;
    }
    // Postalveolar Groove (/ʃ, ʒ/)
    else if (place === 'postalveolar') {
      tipX = 155;
      tipY = 88;
      bladeX = 135;
      bladeY = 90;
    }

    const sublingualX = 145;
    const sublingualY = 165 + jawDrop;
    const baseFloorX = 100;
    const baseFloorY = 180;

    return `M ${rootX},${rootY}
            C ${pharynxBackX},${pharynxBackY} ${dorsumX - 25},${dorsumY} ${dorsumX},${dorsumY}
            C ${dorsumX + 22},${dorsumY} ${bladeX},${bladeY} ${tipX},${tipY}
            C ${tipX - 6},${tipY + 14} ${sublingualX},${sublingualY} ${baseFloorX},${baseFloorY}
            Z`;
  };

  const getConstrictionLabel = (place: ArticulatoryPlace, f2: number) => {
    if (place === 'interdental') return 'INTERDENTAL (TEETH)';
    if (place === 'alveolar') return 'ALVEOLAR RIDGE (SEALED)';
    if (place === 'postalveolar') return 'POSTALVEOLAR GROOVE';
    if (place === 'velar') return 'VELAR (SOFT PALATE)';
    if (f2 > 1900) return 'PALATAL';
    if (f2 > 1400) return 'CENTRAL';
    if (f2 > 1000) return 'VELAR';
    return 'PHARYNGEAL';
  };

  useEffect(() => {
    if (targetTongueRef.current) {
      const targetPath = calculateTonguePath(targetF1, targetF2, targetPlace);
      targetTongueRef.current.setAttribute('d', targetPath);
    }
  }, [targetF1, targetF2, targetPlace]);

  useEffect(() => {
    let animationFrameId: number;

    const renderLoop = () => {
      if (currentTongueRef.current && currentJawRef.current) {
        if (isActive) {
          const rawF1 = f1Ref.current || 500;
          const rawF2 = f2Ref.current || 1500;

          animF1.current += (rawF1 - animF1.current) * 0.32;
          animF2.current += (rawF2 - animF2.current) * 0.32;

          const normF1 = Math.max(0, Math.min(1, (animF1.current - 200) / 800));
          const normF2 = Math.max(0, Math.min(1, (animF2.current - 600) / 1900));

          const path = calculateTonguePath(animF1.current, animF2.current, targetPlace);
          const jawDrop = targetPlace === 'interdental' ? 6 : targetPlace === 'alveolar' ? 3 : normF1 * 18;

          currentTongueRef.current.setAttribute('d', path);
          currentJawRef.current.setAttribute('transform', `translate(0, ${jawDrop})`);

          // Dynamic Lip Protrusion
          const lipProtrusion = (1.0 - normF2) * 10;
          if (upperLipRef.current) {
            upperLipRef.current.setAttribute('transform', `translate(${lipProtrusion}, 0)`);
          }
          if (lowerLipRef.current) {
            lowerLipRef.current.setAttribute('transform', `translate(${lipProtrusion}, 0)`);
          }

          // Constriction Glow Coordinate
          let gx = 82 + normF2 * 54;
          let gy = 66 + normF1 * 50;

          if (targetPlace === 'interdental') {
            gx = 186;
            gy = 104;
          } else if (targetPlace === 'alveolar') {
            gx = 168;
            gy = 76;
          } else if (targetPlace === 'velar') {
            gx = 72;
            gy = 48;
          }

          if (constrictionGlowRef.current) {
            constrictionGlowRef.current.setAttribute('cx', `${gx}`);
            constrictionGlowRef.current.setAttribute('cy', `${gy}`);
          }

          if (constrictionTextRef.current) {
            constrictionTextRef.current.textContent = getConstrictionLabel(targetPlace, animF2.current);
            constrictionTextRef.current.setAttribute('x', `${gx}`);
            constrictionTextRef.current.setAttribute('y', `${Math.max(22, gy - 12)}`);
          }

          animationFrameId = requestAnimationFrame(renderLoop);
        } else {
          const path = calculateTonguePath(500, 1500, 'vowel');
          gsap.to(currentTongueRef.current, {
            attr: { d: path },
            duration: 0.6,
            ease: 'power2.out'
          });
          gsap.to(currentJawRef.current, {
            y: 5,
            duration: 0.6,
            ease: 'power2.out'
          });
        }
      }
    };

    if (isActive) {
      renderLoop();
    } else {
      renderLoop();
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [isActive, f1Ref, f2Ref, targetPlace]);

  return (
    <div className="w-full h-full min-h-[300px] relative bg-slate-900 rounded-xl overflow-hidden flex items-center justify-center p-3 select-none">
      <svg viewBox="0 0 200 200" className="w-full h-full max-w-[340px] drop-shadow-xl" preserveAspectRatio="xMidYMid meet">
        <defs>
          {/* Tongue Gradient */}
          <linearGradient id="vocalTongueGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#047857" stopOpacity="0.95" />
          </linearGradient>

          {/* Hard Palate / Bone Gradient */}
          <linearGradient id="vocalPalateGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#334155" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>

          <filter id="vocalSoftGlow2" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* --- STATIC UPPER ANATOMY --- */}
        <path
          d="M 50,15 L 180,15 C 190,15 195,30 190,50 L 175,55 L 175,65 Z"
          fill="#1e293b"
          opacity="0.4"
        />

        {/* Hard Palate & Alveolar Ridge */}
        <path
          d="M 60,65 C 80,48 135,46 165,65 L 175,65 L 175,50 C 130,30 75,32 50,55 Z"
          fill="url(#vocalPalateGrad2)"
          stroke="#475569"
          strokeWidth="1.2"
        />

        {/* Alveolar Ridge Target Highlight Zone */}
        <rect
          x="162"
          y="62"
          width="12"
          height="8"
          rx="3"
          fill={targetPlace === 'alveolar' ? 'rgba(99, 102, 241, 0.4)' : 'transparent'}
          stroke={targetPlace === 'alveolar' ? '#818cf8' : 'transparent'}
          strokeWidth="1"
          strokeDasharray="2 1"
        />

        {/* Soft Palate (Velum) and Uvula */}
        <path
          d="M 60,65 C 52,75 50,95 48,110 C 46,118 42,120 40,115 C 38,105 45,75 52,58 Z"
          fill="#475569"
          stroke="#64748b"
          strokeWidth="1"
          opacity="0.9"
        />

        {/* Posterior Pharyngeal Wall */}
        <path
          d="M 36,90 L 36,195 L 48,195 L 48,110 Z"
          fill="#1e293b"
          stroke="#334155"
          strokeWidth="1.5"
        />

        {/* Upper Lip */}
        <g ref={upperLipRef}>
          <path
            d="M 188,40 C 195,55 192,70 178,74 L 175,76 C 172,77 170,80 172,84 C 176,88 184,86 186,92 C 188,96 182,100 174,100 L 170,100"
            fill="none"
            stroke="#64748b"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </g>

        {/* Upper Incisor Teeth */}
        <polygon points="168,76 174,76 172,92 167,90" fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.8" />

        {/* Glottis / Vocal Folds */}
        <g transform="translate(48, 185)">
          <line x1="0" y1="0" x2="16" y2="0" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" />
          <text x="20" y="3" fill="#fda4af" fontSize="7" fontWeight="bold" fontFamily="sans-serif">GLOTTIS</text>
        </g>

        {/* --- TARGET TONGUE GHOST CONTOUR --- */}
        <path
          ref={targetTongueRef}
          d={calculateTonguePath(targetF1, targetF2, targetPlace)}
          fill="rgba(99, 102, 241, 0.08)"
          stroke="#818cf8"
          strokeWidth="2"
          strokeDasharray="5 3"
          className="opacity-75"
        />

        {/* --- LIVE USER TONGUE CONTOUR --- */}
        <path
          ref={currentTongueRef}
          d={calculateTonguePath(500, 1500, 'vowel')}
          fill="url(#vocalTongueGrad2)"
          stroke="#34d399"
          strokeWidth="2"
          filter="url(#vocalSoftGlow2)"
        />

        {/* Constriction Radar Halo */}
        <circle
          ref={constrictionGlowRef}
          cx="110"
          cy="95"
          r="6"
          fill="#34d399"
          opacity={isActive ? "0.6" : "0"}
          className="animate-ping pointer-events-none"
        />

        {/* Constriction Place Tag */}
        <text
          ref={constrictionTextRef}
          x="110"
          y="40"
          fill="#34d399"
          fontSize="7"
          fontWeight="bold"
          textAnchor="middle"
          opacity={isActive ? "0.9" : "0"}
          letterSpacing="1"
        >
          {targetPlace.toUpperCase()}
        </text>

        {/* Dynamic Mandible, Lower Lip & Teeth */}
        <g ref={currentJawRef} transform="translate(0, 5)">
          <path
            d="M 172,130 C 180,132 186,138 184,146 C 182,154 172,168 155,182 C 140,194 110,196 90,196 L 90,185 C 115,185 145,178 158,162 Z"
            fill="#1e293b"
            stroke="#475569"
            strokeWidth="1"
          />

          <g ref={lowerLipRef}>
            <path
              d="M 174,110 C 184,112 186,118 182,126 C 178,132 172,134 168,132"
              fill="none"
              stroke="#64748b"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </g>

          <polygon points="166,115 171,115 170,130 165,128" fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.8" />
        </g>

        {/* Anatomical Reference Tags */}
        <text x="110" y="32" fill="#94a3b8" fontSize="7" fontWeight="bold" textAnchor="middle" letterSpacing="1">HARD PALATE</text>
        <text x="35" y="75" fill="#94a3b8" fontSize="7" fontWeight="bold" textAnchor="end" letterSpacing="1">VELUM</text>
        <text x="188" y="105" fill="#94a3b8" fontSize="7" fontWeight="bold" textAnchor="start" letterSpacing="1">LIPS</text>
      </svg>

      {/* Top Overlay Badge */}
      <div className="absolute top-3 left-3 flex items-center gap-2 px-2.5 py-1 bg-slate-800/80 backdrop-blur-md rounded-lg border border-slate-700/60 text-[11px] font-medium text-slate-300">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        Sagittal Kinematics
      </div>
    </div>
  );
}
