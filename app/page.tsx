import { PronunciationCoach } from '@/components/pronunciation-coach';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Articulatory Coach</h1>
          </div>
          <nav className="flex gap-6 text-sm font-medium text-slate-500">
            <a href="#" className="text-indigo-600">Practice</a>
            <a href="#" className="hover:text-slate-900 transition-colors">Calibration</a>
            <a href="#" className="hover:text-slate-900 transition-colors">Progress</a>
          </nav>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <PronunciationCoach />
      </div>
    </main>
  );
}
