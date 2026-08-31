'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Wireframe } from '@react-three/drei';
import { gsap } from 'gsap';

interface VocalTractProps {
  f1: number;
  f2: number;
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

function DynamicTongue({ f1, f2, color, opacity, wireframe, isTarget }: { f1: number, f2: number, color: number, opacity: number, wireframe: boolean, isTarget: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geoRef = useRef<THREE.PlaneGeometry>(null);
  const basePosRef = useRef<Float32Array | null>(null);

  // We use GSAP to smoothly animate the current F1/F2 state.
  // If it's the target mesh, we don't animate to it, we just display it.
  const animatedStateRef = useRef({ f1: 500, f2: 1500 });

  useEffect(() => {
    if (geoRef.current && !basePosRef.current) {
      basePosRef.current = new Float32Array(geoRef.current.attributes.position.array);
    }
  }, []);

  useEffect(() => {
    if (isTarget) {
       animatedStateRef.current.f1 = f1;
       animatedStateRef.current.f2 = f2;
    } else {
       gsap.to(animatedStateRef.current, {
         f1: f1,
         f2: f2,
         duration: 0.2, // Fast, low latency response
         ease: "power2.out",
       });
    }
  }, [f1, f2, isTarget]);

  useFrame(() => {
    if (!geoRef.current || !basePosRef.current) return;
    
    const positions = geoRef.current.attributes.position.array as Float32Array;
    const basePos = basePosRef.current;
    
    // Deform based on animated F1/F2
    const currentF1 = animatedStateRef.current.f1;
    const currentF2 = animatedStateRef.current.f2;

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

function Scene({ f1, f2, targetF1, targetF2, isActive }: VocalTractProps) {
  const sceneGroupRef = useRef<THREE.Group>(null);

  useFrame(({ clock }) => {
    if (sceneGroupRef.current) {
      // Gentle idle animation
      sceneGroupRef.current.rotation.y = Math.sin(clock.elapsedTime * 0.5) * 0.1;
      sceneGroupRef.current.rotation.x = Math.cos(clock.elapsedTime * 0.5) * 0.05;
    }
  });

  // If not active, drift back to neutral
  const displayF1 = isActive ? f1 : 600;
  const displayF2 = isActive ? f2 : 1500;

  return (
    <group ref={sceneGroupRef}>
      <Palate />

      {/* Target Tongue - Ghost Wireframe */}
      <DynamicTongue
        f1={targetF1} f2={targetF2}
        color={0x6366f1} opacity={0.2}
        wireframe={true} isTarget={true}
      />

      {/* Current Tongue - Solid / Wireframe blend */}
      <DynamicTongue
        f1={displayF1} f2={displayF2}
        color={0x10b981} opacity={0.6}
        wireframe={false} isTarget={false}
      />
      <DynamicTongue
        f1={displayF1} f2={displayF2}
        color={0x059669} opacity={0.8}
        wireframe={true} isTarget={false}
      />

      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 10]} intensity={1} />
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
