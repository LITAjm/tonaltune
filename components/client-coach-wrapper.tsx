'use client';

import dynamic from 'next/dynamic';

const PronunciationCoach = dynamic(
  () => import('./pronunciation-coach').then((mod) => mod.PronunciationCoach),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-slate-400 gap-3 font-medium">
        <div className="w-9 h-9 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs uppercase tracking-widest font-bold">Initializing 3D Vocalization Engine...</p>
      </div>
    )
  }
);

export function ClientCoachWrapper() {
  return <PronunciationCoach />;
}
