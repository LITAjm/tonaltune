'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Wireframe } from '@react-three/drei';
import { gsap } from 'gsap';

interface VocalTractProps {
  f1Ref: React.RefObject<number>;
  f2Ref: React.RefObject<number>;
  targetF1: number;
  targetF2: number;
  isActive: boolean;
}

function Palate() {
  return (
    <mesh position={[0, 2, 0]} rotation={[0, 0, Math.PI / 2]}>
      <cylinderGeometry args={[4, 4, 8, 32, 16, true, 0, Math.PI]} />
      <meshBasicMaterial color={0x334155} wireframe transparent opacity={0.4} />
    </mesh>
  );
}

function DynamicTongue({ f1Ref, f2Ref, staticF1, staticF2, color, opacity, wireframe, isTarget }: { f1Ref?: React.RefObject<number>, f2Ref?: React.RefObject<number>, staticF1?: number, staticF2?: number, color: number, opacity: number, wireframe: boolean, isTarget: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geoRef = useRef<THREE.PlaneGeometry>(null);
  const basePosRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    if (geoRef.current && !basePosRef.current) {
      basePosRef.current = new Float32Array(geoRef.current.attributes.position.array);
    }
  }, []);

  // For useFrame, we read directly from the Refs if provided, otherwise use static values
  useFrame(() => {
    if (!geoRef.current || !basePosRef.current) return;
    
    const positions = geoRef.current.attributes.position.array as Float32Array;
    const basePos = basePosRef.current;
    
    // Read current formants
    const currentF1 = (isTarget || !f1Ref) ? (staticF1 || 500) : (f1Ref.current || 500);
    const currentF2 = (isTarget || !f2Ref) ? (staticF2 || 1500) : (f2Ref.current || 1500);

    const bumpHeight = 5.5 - (Math.max(0, Math.min(1, (currentF1 - 200) / 800))) * 5.0;
    const bumpX = -4.5 + (Math.max(0, Math.min(1, (currentF2 - 600) / 1900))) * 9;

    for (let i = 0; i < positions.length; i += 3) {
      const x = basePos[i];
      const z = basePos[i + 2];
      const dist = Math.abs(x - bumpX);

      // More organic deformation curve
      const yOffset = bumpHeight * Math.exp(-(dist * dist) / 5.5);
      const zFactor = Math.cos((z / 4) * (Math.PI / 2));
      positions[i + 1] = basePos[i + 1] + (yOffset * Math.max(0, zFactor));
    }
    geoRef.current.attributes.position.needsUpdate = true;
    geoRef.current.computeVertexNormals();
  });

  return (
    <mesh ref={meshRef} position={[0, -2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry ref={geoRef} args={[12, 8, 64, 32]} />
      <meshStandardMaterial
        color={color}
        wireframe={wireframe}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function Scene({ f1Ref, f2Ref, targetF1, targetF2, isActive }: VocalTractProps) {
  const sceneGroupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (sceneGroupRef.current) {
      // Gentle idle animation
      sceneGroupRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.5) * 0.1;
      sceneGroupRef.current.rotation.x = Math.cos(clock.elapsedTime * 0.5) * 0.05;
    }
  });

  return (
    <group ref={sceneGroupRef}>
      <Palate />

      {/* Target Tongue - Ghost Wireframe */}
      <DynamicTongue
        staticF1={targetF1} staticF2={targetF2}
        color={0x6366f1} opacity={0.2}
        wireframe={true} isTarget={true}
      />

      {/* Current Tongue - Solid / Wireframe blend */}
      <DynamicTongue
        f1Ref={f1Ref} f2Ref={f2Ref}
        color={0x10b981} opacity={0.9}
        wireframe={false} isTarget={false}
      />
      <DynamicTongue
        f1Ref={f1Ref} f2Ref={f2Ref}
        color={0x059669} opacity={0.8}
        wireframe={true} isTarget={false}
      />

      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 10, 10]} intensity={1.5} />
      <directionalLight position={[-10, 5, -10]} intensity={0.5} color={0x6366f1} />
    </group>
  );
}

export function VocalTract(props: VocalTractProps) {
  return (
    <div className="w-full h-full relative bg-slate-900 rounded-xl overflow-hidden cursor-move">
      <Canvas camera={{ position: [0, 4, 16], fov: 45 }}>
        <Scene {...props} />
        <OrbitControls enableZoom={false} enablePan={false} />
      </Canvas>
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent to-slate-900/80" />
    </div>
  );
}
