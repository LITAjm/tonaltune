'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { gsap } from 'gsap';

interface VocalTractProps {
  f1: number;
  f2: number;
  targetF1: number;
  targetF2: number;
  isActive: boolean;
}

export function VocalTract({ f1, f2, targetF1, targetF2, isActive }: VocalTractProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    tongueMesh: THREE.Mesh;
    targetMesh: THREE.Mesh;
    basePositions: Float32Array;
    targetBasePositions: Float32Array;
    animationState: { f1: number; f2: number };
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const scene = new THREE.Scene();
    
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 4, 14);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);

    // Palate (Roof of mouth) - Static Wireframe
    const palateGeo = new THREE.CylinderGeometry(4, 4, 8, 20, 10, true, 0, Math.PI);
    palateGeo.rotateZ(Math.PI / 2);
    palateGeo.translate(0, 2, 0);
    const palateMat = new THREE.MeshBasicMaterial({ 
      color: 0x334155, 
      wireframe: true, 
      transparent: true, 
      opacity: 0.4 
    });
    const palateMesh = new THREE.Mesh(palateGeo, palateMat);
    scene.add(palateMesh);

    // Tongue - Dynamic Wireframe
    const tongueGeo = new THREE.PlaneGeometry(10, 6, 40, 20);
    tongueGeo.rotateX(-Math.PI / 2);
    tongueGeo.translate(0, -2, 0);
    const basePositions = new Float32Array(tongueGeo.attributes.position.array);
    
    const tongueMat = new THREE.MeshBasicMaterial({ 
      color: 0x10b981, 
      wireframe: true,
      transparent: true,
      opacity: 0.8
    });
    const tongueMesh = new THREE.Mesh(tongueGeo, tongueMat);
    scene.add(tongueMesh);

    // Target Tongue - Ghost Wireframe
    const targetGeo = new THREE.PlaneGeometry(10, 6, 40, 20);
    targetGeo.rotateX(-Math.PI / 2);
    targetGeo.translate(0, -2, 0);
    const targetBasePositions = new Float32Array(targetGeo.attributes.position.array);
    
    const targetMat = new THREE.MeshBasicMaterial({ 
      color: 0x6366f1, 
      wireframe: true,
      transparent: true,
      opacity: 0.3
    });
    const targetMesh = new THREE.Mesh(targetGeo, targetMat);
    scene.add(targetMesh);

    let frameId: number;
    const render = () => {
      renderer.render(scene, camera);
      scene.rotation.y = Math.sin(Date.now() * 0.0005) * 0.1;
      scene.rotation.x = Math.cos(Date.now() * 0.0005) * 0.05;
      frameId = requestAnimationFrame(render);
    };
    render();

    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    sceneRef.current = {
      scene, camera, renderer, tongueMesh, targetMesh, basePositions, targetBasePositions,
      animationState: { f1: 500, f2: 1500 }
    };

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameId);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      tongueGeo.dispose();
      tongueMat.dispose();
      palateGeo.dispose();
      palateMat.dispose();
      targetGeo.dispose();
      targetMat.dispose();
    };
  }, []);

  const updateTongueGeometry = (mesh: THREE.Mesh, basePos: Float32Array, currentF1: number, currentF2: number) => {
    const positions = mesh.geometry.attributes.position.array as Float32Array;
    // Exaggerate the height (F1) and front/back (F2) movements
    const bumpHeight = 5.5 - (Math.max(0, Math.min(1, (currentF1 - 200) / 800))) * 5.0;
    const bumpX = -4.5 + (Math.max(0, Math.min(1, (currentF2 - 600) / 1900))) * 9;

    for (let i = 0; i < positions.length; i += 3) {
      const x = basePos[i];
      const z = basePos[i + 2];
      const dist = Math.abs(x - bumpX);
      // Make the tongue bump wider and more pronounced
      const yOffset = bumpHeight * Math.exp(-(dist * dist) / 4.5);
      const zFactor = Math.cos((z / 3) * (Math.PI / 2));
      positions[i + 1] = basePos[i + 1] + (yOffset * Math.max(0, zFactor));
    }
    mesh.geometry.attributes.position.needsUpdate = true;
  };

  useEffect(() => {
    if (!sceneRef.current) return;
    const { tongueMesh, targetMesh, basePositions, targetBasePositions, animationState } = sceneRef.current;

    updateTongueGeometry(targetMesh, targetBasePositions, targetF1, targetF2);

    if (isActive) {
      gsap.to(animationState, {
        f1: f1,
        f2: f2,
        duration: 0.4,
        ease: "power2.out",
        onUpdate: () => {
          updateTongueGeometry(tongueMesh, basePositions, animationState.f1, animationState.f2);
        }
      });
    } else {
      gsap.to(animationState, {
        f1: 600,
        f2: 1500,
        duration: 0.8,
        ease: "elastic.out(1, 0.5)",
        onUpdate: () => {
          updateTongueGeometry(tongueMesh, basePositions, animationState.f1, animationState.f2);
        }
      });
    }
  }, [f1, f2, targetF1, targetF2, isActive]);

  return (
    <div className="w-full h-full relative bg-slate-900 rounded-xl overflow-hidden" ref={containerRef}>
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent to-slate-900/80" />
    </div>
  );
}
