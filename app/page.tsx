import { ClientCoachWrapper } from '@/components/client-coach-wrapper';

export default function Home() {
  return (
    <main className="h-screen w-screen bg-slate-900 text-slate-100 font-sans selection:bg-indigo-500/30 flex flex-col overflow-hidden">
      {/* Sleek Top Navigation Bar */}
      <header className="bg-slate-950 border-b border-slate-800 shrink-0 h-14 px-5 flex items-center justify-between z-30 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center shadow-xs">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white leading-none">Articulatory Coach</h1>
            <span className="text-[10px] text-indigo-400 font-medium">Real-Time 3D Vocalization & Articulation Studio</span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs font-semibold text-slate-400">
          <span className="text-emerald-400 bg-emerald-950/80 px-3 py-1 rounded-full border border-emerald-800/60 font-bold flex items-center gap-1.5 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Real-Time Audio Engine
          </span>
        </div>
      </header>

      {/* Main Full-Screen Cockpit Viewport */}
      <div className="flex-1 overflow-hidden p-3.5 bg-slate-950/60">
        <ClientCoachWrapper />
      </div>
    </main>
  );
}
