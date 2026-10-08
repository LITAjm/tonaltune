'use client';

import { useEffect, useRef, useMemo, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Camera, Eye, RotateCw } from 'lucide-react';

export type ArticulatoryPlace = 'interdental' | 'alveolar' | 'postalveolar' | 'palatal' | 'velar' | 'labiodental' | 'vowel';

interface VocalTractProps {
  f1Ref: React.RefObject<number>;
  f2Ref: React.RefObject<number>;
  f3Ref?: React.RefObject<number>;
  targetF1: number;
  targetF2: number;
  targetF3?: number;
  targetPlace?: ArticulatoryPlace;
  isActive: boolean;
}

/**
 * Generates an anatomical, smooth volumetric 3D tongue mesh:
 * - Elongated muscular body with realistic length-to-width ratio
 * - Smoothly rounded apex (tip) pointing forward
 * - Sulcus medianus (central longitudinal groove)
 * - Tapered lateral margins and muscular root
 */
function createAnatomicalTongueGeometry(nx = 48, nz = 32): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const vertexCount = (nx + 1) * (nz + 1) * 2;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];

  const lengthX = 11.6;
  const baseWidthZ = 5.2;

  let ptr = 0;
  let uvPtr = 0;

  // 1. Dorsal (Top) Surface
  for (let j = 0; j <= nz; j++) {
    const v = j / nz;
    const normZ = (v - 0.5) * 2; // -1 to +1

    for (let i = 0; i <= nx; i++) {
      const u = i / nx;
      // x from posterior root (-5.8) to anterior tip (+5.8)
      const x = (u - 0.5) * lengthX;

      // Realistic anatomical lateral contour:
      // Narrow at anterior tip (x > 4), widest at mid-body (x ~ 0..2), tapering into pharynx (x < -3)
      let widthFactor = 1.0;
      if (x > 2.0) {
        // Tip taper
        const t = (x - 2.0) / 3.8;
        widthFactor = 1.0 - Math.pow(t, 1.6) * 0.65;
      } else if (x < -2.0) {
        // Root taper
        const t = (-2.0 - x) / 3.8;
        widthFactor = 1.0 - t * 0.35;
      }

      const z = normZ * (baseWidthZ * 0.5) * Math.max(0.18, widthFactor);

      // Base anatomical height profile
      // Root is lower, mid-body has dorsal curvature, tip is rounded
      const dorsalArch = Math.cos((u - 0.45) * Math.PI * 0.9) * 0.8;
      const transverseCurvature = Math.cos(normZ * Math.PI * 0.5) * 0.5;
      const medianGroove = -Math.exp(-normZ * normZ * 8.0) * 0.22; // Sulcus medianus

      const y = dorsalArch + transverseCurvature + medianGroove;

      positions[ptr++] = x;
      positions[ptr++] = y;
      positions[ptr++] = z;

      uvs[uvPtr++] = u;
      uvs[uvPtr++] = v;
    }
  }

  // 2. Ventral (Inferior/Bottom) Surface
  for (let j = 0; j <= nz; j++) {
    const v = j / nz;
    const normZ = (v - 0.5) * 2;

    for (let i = 0; i <= nx; i++) {
      const u = i / nx;
      const x = (u - 0.5) * lengthX;

      let widthFactor = 1.0;
      if (x > 2.0) {
        const t = (x - 2.0) / 3.8;
        widthFactor = 1.0 - Math.pow(t, 1.6) * 0.65;
      } else if (x < -2.0) {
        const t = (-2.0 - x) / 3.8;
        widthFactor = 1.0 - t * 0.35;
      }

      const z = normZ * (baseWidthZ * 0.5) * Math.max(0.18, widthFactor);
      const y = -1.4 - Math.cos((u - 0.5) * Math.PI * 0.8) * 0.6;

      positions[ptr++] = x;
      positions[ptr++] = y;
      positions[ptr++] = z;

      uvs[uvPtr++] = u;
      uvs[uvPtr++] = v;
    }
  }

  const stride = nx + 1;
  const bottomOffset = (nx + 1) * (nz + 1);

  // Top Surface Triangles
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * stride + i;
      const b = (j + 1) * stride + i;
      const c = (j + 1) * stride + (i + 1);
      const d = j * stride + (i + 1);

      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  // Bottom Surface Triangles
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = bottomOffset + j * stride + i;
      const b = bottomOffset + (j + 1) * stride + i;
      const c = bottomOffset + (j + 1) * stride + (i + 1);
      const d = bottomOffset + j * stride + (i + 1);

      indices.push(a, d, b);
      indices.push(b, d, c);
    }
  }

  // Side Margin Walls
  for (let i = 0; i < nx; i++) {
    const topA = i;
    const topB = i + 1;
    const botA = bottomOffset + i;
    const botB = bottomOffset + i + 1;

    indices.push(topA, topB, botA);
    indices.push(topB, botB, botA);
  }

  for (let i = 0; i < nx; i++) {
    const topA = nz * stride + i;
    const topB = nz * stride + i + 1;
    const botA = bottomOffset + nz * stride + i;
    const botB = bottomOffset + nz * stride + i + 1;

    indices.push(topA, botA, topB);
    indices.push(topB, botA, botB);
  }

  // Anterior Tip Rounding
  for (let j = 0; j < nz; j++) {
    const topA = j * stride + nx;
    const topB = (j + 1) * stride + nx;
    const botA = bottomOffset + j * stride + nx;
    const botB = bottomOffset + (j + 1) * stride + nx;

    indices.push(topA, topB, botA);
    indices.push(topB, botB, botA);
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  return geo;
}

/**
 * Anatomical Palate Vault & Smooth Dental Arch (No crude floating blocks)
 */
function AnatomicalOralCavity({ targetPlace = 'vowel' }: { targetPlace?: ArticulatoryPlace }) {
  // Smooth Palate Arch
  const palateGeo = useMemo(() => {
    const geo = new THREE.CylinderGeometry(4.8, 4.8, 12, 40, 20, true, 0, Math.PI);
    geo.rotateZ(Math.PI / 2);
    geo.translate(0, 2.4, 0);
    return geo;
  }, []);

  // Parabolic Upper Dental Arch with Incisors
  const teethGroup = useMemo(() => {
    const group = new THREE.Group();
    const toothGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.75, 12);
    toothGeo.rotateX(Math.PI / 2);

    const toothMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.18,
      metalness: 0.05,
    });

    // 8 visible maxillary teeth in a natural parabolic arch
    const archRadius = 2.4;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 7 - 0.5) * Math.PI * 0.75;
      const mesh = new THREE.Mesh(toothGeo, toothMat);
      const x = 5.2 - (1.0 - Math.cos(angle)) * 1.8;
      const z = Math.sin(angle) * archRadius;
      mesh.position.set(x, 1.6, z);
      mesh.rotation.y = -angle * 0.7;
      group.add(mesh);
    }
    return group;
  }, []);

  return (
    <group>
      {/* Translucent Anatomical Palate Vault */}
      <mesh geometry={palateGeo}>
        <meshStandardMaterial
          color={0x334155}
          wireframe
          transparent
          opacity={0.28}
          roughness={0.9}
        />
      </mesh>

      {/* Realistic Maxillary Teeth Arch */}
      <primitive object={teethGroup} />

      {/* --- LUMINOUS CONTACT TARGET ZONES ("THE MAGIC SPOTS") --- */}

      {/* 1. Interdental Zone (Between teeth for /θ, ð/) */}
      <mesh position={[5.4, 1.0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <ringGeometry args={[0.3, 1.6, 24]} />
        <meshStandardMaterial
          color={targetPlace === 'interdental' ? 0x6366f1 : 0x334155}
          emissive={targetPlace === 'interdental' ? 0x818cf8 : 0x000000}
          emissiveIntensity={targetPlace === 'interdental' ? 1.2 : 0}
          transparent
          opacity={targetPlace === 'interdental' ? 0.9 : 0.08}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 2. Alveolar Ridge Contact Zone (for /t, d, n, l, -ed/) */}
      <mesh position={[4.4, 2.2, 0]} rotation={[Math.PI / 4, 0, 0]}>
        <cylinderGeometry args={[1.5, 1.5, 0.35, 24]} />
        <meshStandardMaterial
          color={targetPlace === 'alveolar' ? 0x6366f1 : 0x334155}
          emissive={targetPlace === 'alveolar' ? 0x818cf8 : 0x000000}
          emissiveIntensity={targetPlace === 'alveolar' ? 1.2 : 0}
          transparent
          opacity={targetPlace === 'alveolar' ? 0.9 : 0.08}
        />
      </mesh>

      {/* 3. Postalveolar Zone (for /ʃ, ʒ/) */}
      <mesh position={[2.8, 2.4, 0]}>
        <cylinderGeometry args={[1.6, 1.6, 0.35, 24]} />
        <meshStandardMaterial
          color={targetPlace === 'postalveolar' ? 0x6366f1 : 0x334155}
          emissive={targetPlace === 'postalveolar' ? 0x818cf8 : 0x000000}
          emissiveIntensity={targetPlace === 'postalveolar' ? 1.2 : 0}
          transparent
          opacity={targetPlace === 'postalveolar' ? 0.9 : 0.08}
        />
      </mesh>

      {/* 4. Velar Soft Palate Zone (for /k, g/) */}
      <mesh position={[-2.6, 2.1, 0]}>
        <cylinderGeometry args={[1.8, 1.8, 0.35, 24]} />
        <meshStandardMaterial
          color={targetPlace === 'velar' ? 0x6366f1 : 0x334155}
          emissive={targetPlace === 'velar' ? 0x818cf8 : 0x000000}
          emissiveIntensity={targetPlace === 'velar' ? 1.2 : 0}
          transparent
          opacity={targetPlace === 'velar' ? 0.9 : 0.08}
        />
      </mesh>
    </group>
  );
}

/**
 * Lifelike 3D Tongue Mesh with Kinematic Formant & Articulatory Deformation
 */
function LifelikeTongueMesh({
  f1Ref,
  f2Ref,
  f3Ref,
  staticF1,
  staticF2,
  staticF3,
  isTarget = false,
  targetF1,
  targetF2,
  targetPlace = 'vowel'
}: {
  f1Ref?: React.RefObject<number>;
  f2Ref?: React.RefObject<number>;
  f3Ref?: React.RefObject<number>;
  staticF1?: number;
  staticF2?: number;
  staticF3?: number;
  isTarget?: boolean;
  targetF1?: number;
  targetF2?: number;
  targetPlace?: ArticulatoryPlace;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geoRef = useRef<THREE.BufferGeometry>(null);
  const basePositionsRef = useRef<Float32Array | null>(null);

  const currentF1 = useRef(staticF1 || 500);
  const currentF2 = useRef(staticF2 || 1500);
  const currentF3 = useRef(staticF3 || 2500);

  const initialGeo = useMemo(() => createAnatomicalTongueGeometry(48, 32), []);

  useEffect(() => {
    if (initialGeo) {
      basePositionsRef.current = new Float32Array(initialGeo.attributes.position.array);
    }
  }, [initialGeo]);

  useFrame((_, delta) => {
    if (!geoRef.current || !basePositionsRef.current) return;

    let targetF1Val = staticF1 || 500;
    let targetF2Val = staticF2 || 1500;
    let targetF3Val = staticF3 || 2500;

    if (!isTarget && f1Ref && f2Ref) {
      targetF1Val = f1Ref.current || 500;
      targetF2Val = f2Ref.current || 1500;
      targetF3Val = f3Ref?.current || 2500;
    }

    const lerpSpeed = isTarget ? 14 : 24;
    currentF1.current += (targetF1Val - currentF1.current) * Math.min(1, delta * lerpSpeed);
    currentF2.current += (targetF2Val - currentF2.current) * Math.min(1, delta * lerpSpeed);
    currentF3.current += (targetF3Val - currentF3.current) * Math.min(1, delta * lerpSpeed);

    const f1 = currentF1.current;
    const f2 = currentF2.current;
    const f3 = currentF3.current;

    const normF1 = Math.max(0, Math.min(1, (f1 - 200) / 800));
    const normF2 = Math.max(0, Math.min(1, (f2 - 600) / 1900));
    const normF3 = Math.max(0, Math.min(1, (f3 - 1600) / 1600));

    // Place-specific contact kinematics
    let tipInterdentalProtrude = 0;
    let tipAlveolarElevate = 0;
    let velarSeal = 0;

    if (targetPlace === 'interdental') {
      tipInterdentalProtrude = 1.8;
    } else if (targetPlace === 'alveolar') {
      tipAlveolarElevate = 2.4;
    } else if (targetPlace === 'velar') {
      velarSeal = 2.2;
    }

    // Kinematic constriction center (F2 advancement: -4.0 back to +3.6 front)
    const constrictionX = -3.8 + normF2 * 7.4;
    const maxArchElevation = 4.8 - normF1 * 3.8;
    const jawDescent = normF1 * 1.4;

    const positions = geoRef.current.attributes.position.array as Float32Array;
    const base = basePositionsRef.current;
    const halfCount = base.length / 6;

    for (let i = 0; i < base.length; i += 3) {
      let bx = base[i];
      const by = base[i + 1];
      const bz = base[i + 2];
      const isTop = i < halfCount * 3;

      // Interdental protrusion (/θ, ð/)
      if (bx > 2.8 && tipInterdentalProtrude > 0) {
        bx += tipInterdentalProtrude * Math.exp(-(bz * bz) / 2.2);
      }

      // Dorsal elevation hump
      const distFromConstriction = Math.abs(bx - constrictionX);
      const humpFactor = Math.exp(-(distFromConstriction * distFromConstriction) / 4.6);
      const transverseArch = Math.cos(Math.max(-Math.PI / 2, Math.min(Math.PI / 2, (bz / 2.6) * (Math.PI / 2))));

      // Alveolar Contact seal (/t, d, -ed/)
      const alveolarLift = bx > 3.2 ? tipAlveolarElevate * Math.exp(-(bz * bz) / 1.8) : 0;

      // Velar seal (/k, g/)
      const velarLift = (bx > -3.8 && bx < -0.8) ? velarSeal * Math.exp(-Math.pow(bx + 2.2, 2) / 2.0) : 0;

      // Rhotic retroflex curl (Low F3)
      const retroflexCurl = (1.0 - normF3) * (bx > 3.0 ? Math.exp(-(bz * bz) / 1.5) * 1.6 : 0);

      const dy = (maxArchElevation * humpFactor * transverseArch + alveolarLift + velarLift + retroflexCurl);

      if (isTop) {
        positions[i] = bx;
        positions[i + 1] = by + dy - jawDescent;
        positions[i + 2] = bz;
      } else {
        positions[i] = bx;
        positions[i + 1] = by - jawDescent + (dy * 0.22);
        positions[i + 2] = bz;
      }
    }

    geoRef.current.attributes.position.needsUpdate = true;
    geoRef.current.computeVertexNormals();

    // Visual contact feedback glow
    if (!isTarget && targetF1 && targetF2 && meshRef.current) {
      const f1Diff = Math.abs(f1 - targetF1);
      const f2Diff = Math.abs(f2 - targetF2);
      const isMatch = f1Diff < 140 && f2Diff < 220;

      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      if (mat) {
        mat.emissive.set(isMatch ? 0x10b981 : 0x881337);
        mat.emissiveIntensity = isMatch ? 0.8 : 0.15;
      }
    }
  });

  return (
    <group position={[0, -1.6, 0]}>
      {isTarget ? (
        <mesh ref={meshRef} geometry={initialGeo}>
          <meshBasicMaterial
            color={0x818cf8}
            wireframe
            transparent
            opacity={0.28}
          />
        </mesh>
      ) : (
        <mesh ref={meshRef} geometry={initialGeo}>
          <primitive object={initialGeo} ref={geoRef} attach="geometry" />
          {/* Lifelike Organic Tongue Mucosa Material */}
          <meshStandardMaterial
            color={0xf43f5e}
            roughness={0.35}
            metalness={0.08}
            emissive={0x881337}
            emissiveIntensity={0.15}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}

export function VocalTract({
  f1Ref,
  f2Ref,
  f3Ref,
  targetF1,
  targetF2,
  targetF3 = 2500,
  targetPlace = 'vowel',
  isActive
}: VocalTractProps) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const [activePreset, setActivePreset] = useState<'side' | 'threeQuarter' | 'front' | 'palate'>('threeQuarter');

  const setViewAngle = (preset: 'side' | 'threeQuarter' | 'front' | 'palate') => {
    setActivePreset(preset);
    if (!controlsRef.current) return;

    if (preset === 'side') {
      controlsRef.current.object.position.set(0, 2, 14);
      controlsRef.current.target.set(0, 0, 0);
    } else if (preset === 'threeQuarter') {
      controlsRef.current.object.position.set(10, 8, 12);
      controlsRef.current.target.set(0.5, 0, 0);
    } else if (preset === 'front') {
      controlsRef.current.object.position.set(15, 1, 0);
      controlsRef.current.target.set(0, 0, 0);
    } else if (preset === 'palate') {
      controlsRef.current.object.position.set(2, 16, 2);
      controlsRef.current.target.set(0, 0, 0);
    }
    controlsRef.current.update();
  };

  return (
    <div className="w-full h-full min-h-[340px] relative bg-slate-950 rounded-xl overflow-hidden select-none">
      {/* View Angle Quick-Switch Ribbon */}
      <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1 bg-slate-900/90 backdrop-blur-md p-1 rounded-lg border border-slate-800 shadow-md">
        <span className="text-[10px] font-bold text-slate-400 px-1.5 uppercase tracking-wider flex items-center gap-1">
          <Camera className="w-3 h-3 text-indigo-400" /> View:
        </span>
        <button
          type="button"
          onClick={() => setViewAngle('side')}
          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
            activePreset === 'side'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Side Profile
        </button>
        <button
          type="button"
          onClick={() => setViewAngle('threeQuarter')}
          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
            activePreset === 'threeQuarter'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          3/4 Angle
        </button>
        <button
          type="button"
          onClick={() => setViewAngle('front')}
          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
            activePreset === 'front'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Front Incisors
        </button>
        <button
          type="button"
          onClick={() => setViewAngle('palate')}
          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
            activePreset === 'palate'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          Palate Top
        </button>
      </div>

      {/* Target Place Badge */}
      <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-3 py-1 rounded-lg border border-slate-800">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider">
          {targetPlace === 'interdental'
            ? 'Interdental /θ, ð/'
            : targetPlace === 'alveolar'
              ? 'Alveolar Ridge /t, d/'
              : targetPlace === 'postalveolar'
                ? 'Postalveolar /ʃ/'
                : targetPlace === 'velar'
                  ? 'Velar Palate /k, g/'
                  : 'Vowel Resonator'}
        </span>
      </div>

      {/* Orbit Controls Hint Badge */}
      <div className="absolute bottom-2.5 right-2.5 z-20 text-[10px] text-slate-400 bg-slate-900/80 px-2 py-0.5 rounded backdrop-blur-sm border border-slate-800/80 flex items-center gap-1 pointer-events-none">
        <RotateCw className="w-2.5 h-2.5 text-slate-400" />
        Rotate 360° • Zoom • Pan
      </div>

      {/* 3D WebGL Canvas */}
      <Canvas
        camera={{ position: [10, 8, 12], fov: 42 }}
        className="w-full h-full cursor-grab active:cursor-grabbing"
      >
        <ambientLight intensity={1.2} />
        <directionalLight position={[12, 14, 10]} intensity={1.8} />
        <directionalLight position={[-10, -8, -10]} intensity={0.6} color="#6366f1" />
        <pointLight position={[0, 4, 0]} intensity={1.2} color="#ffffff" />

        <OrbitControls
          ref={controlsRef}
          enableDamping
          dampingFactor={0.08}
          minDistance={6}
          maxDistance={30}
          target={[0.5, 0, 0]}
        />

        {/* Anatomical Palate Vault & Teeth */}
        <AnatomicalOralCavity targetPlace={targetPlace} />

        {/* Ghost Target Vocal Posture */}
        <LifelikeTongueMesh
          isTarget={true}
          staticF1={targetF1}
          staticF2={targetF2}
          staticF3={targetF3}
          targetPlace={targetPlace}
        />

        {/* Real-time Dynamic Live Tongue */}
        <LifelikeTongueMesh
          f1Ref={f1Ref}
          f2Ref={f2Ref}
          f3Ref={f3Ref}
          targetF1={targetF1}
          targetF2={targetF2}
          targetPlace={targetPlace}
        />
      </Canvas>
    </div>
  );
}
