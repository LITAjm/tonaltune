# AGENTS.md

Guidance for AI agents working in this repository.

## What this is

"Articulatory Coach" (npm name `ai-studio-applet`) — a real-time pronunciation trainer. The user speaks into the mic, an AudioWorklet extracts vowel formants (F1/F2) via LPC in the browser, and the app visualizes tongue position against a target while gamifying accuracy. It originated as a Google AI Studio applet and now runs as a standalone Next.js app.

Single-page app: everything on the page lives in one big client component. `app/page.tsx` just renders `PronunciationCoach` from `components/pronunciation-coach.tsx` (~1200 lines — state, audio wiring, gamification loop, and most JSX are all in there).

## Commands

```bash
bun install        # node_modules is NOT committed; install before anything else
bun run dev        # dev server
bun run build      # production build (TypeScript errors FAIL the build)
bun run lint       # eslint . (next/core-web-vitals); ESLint is NOT run during build
bun run start      # serve production build
```

**This project is managed with Bun. Running `npm` or `npx` in any form is a major violation and must never happen** — not even for one-off commands. The committed npm `package-lock.json` is a leftover from the AI Studio origin, not a signal to use npm. Use `bun install` and `bun run <script>` exclusively.

- There is **no test framework** — no test files, no test runner, no CI configs. Verification means `npm run build` and manual testing in a browser (mic features can't be verified headlessly).
- Builds use `output: 'standalone'`.
- First build/typecheck will surface hundreds of "Cannot find module 'next/server'" / JSX intrinsic element errors from the language server if `node_modules` is missing — that's the missing install, not real code errors.

## Architecture / data flow

**Real-time audio pipeline** (the core of the app):

1. `getUserMedia` → `AudioContext` → `AudioWorkletNode` registered as `'formant-processor'`.
2. The worklet source is `public/worklets/formant-processor.js` — a **plain JS static asset loaded via `audioWorklet.addModule('/worklets/formant-processor.js')`, not part of the webpack bundle**. It implements pre-emphasis → Hamming window → autocorrelation → Levinson-Durbin LPC → spectral peak picking, and posts `{isSpeaking, f1, f2, volume}` messages every 2048-sample buffer.
3. `pronunciation-coach.tsx` receives messages on `workletNode.port.onmessage`, normalizes raw formants into the app's standard coordinate space using the user's calibration, and writes them to refs.

**Performance-critical pattern (do not break this):** current formants live in React **refs** (`currentF1Ref`, `currentF2Ref`), never in state, because the worklet updates at ~20-60Hz. The three visualization components (`vocal-tract-2d.tsx`, `vocal-tract.tsx` for Three.js, `vowel-quadrilateral.tsx`) receive the refs and mutate DOM/Three attributes directly inside `requestAnimationFrame` / `useFrame` loops. React state is only for low-frequency things (target formants, recording/analyzing flags, score).

**Calibration:** on first load the user says "ahh" then "eee"; averaged raw formants are stored in `localStorage` under `vocal_calibration`. Raw worklet values are then linearly remapped so the user's ahh→eee span covers the standard ranges. During calibration, raw values bypass normalization.

**Two separate AI paths with different providers and keys — don't mix them up:**

| Path | Where | Provider / key | Purpose |
|---|---|---|---|
| Recorded practice | Browser-side in `analyzeWithGemini()` | Gemini via `@google/genai`, `NEXT_PUBLIC_GEMINI_API_KEY`, model `gemini-3-flash-preview` | Audio → score, prescriptive feedback, phoneme segmentation (JSON schema enforced) |
| Custom word lookup | Server route `app/api/analyze/route.ts` | OpenRouter REST, `OPENROUTER_API_KEY` (falls back to `NEXT_PUBLIC_OPENROUTER_API_KEY`), model `z-ai/glm-5.3-flash` | Word → IPA vowel symbol, target F1/F2, description, somatosensory cue, syllables, intonation |

A custom word's result replaces `activePhoneme` until a standard pair is selected again.

**Gamification:** a 100ms `setInterval` compares refs vs `displayTarget` (hit threshold: 150Hz on F1, 225Hz on F2). Holding the target 3 seconds triggers "lock-in": +50 points, a synthesized chime, and a 2s visual state. Points also accrue for active time. Sounds are synthesized with the Web Audio API through a shared `AudioContext` (`getSynthAudioContext`) to avoid context exhaustion — reuse it for any new sounds.

**Practice modes** (all in `pronunciation-coach.tsx`): debug sliders (gear icon — drives refs from state, bypasses mic), anchor & glide (animates target from neutral schwa to the phoneme over 4s), over-exaggeration (pushes target 20% further from center), simulated native example (bell-curve animation of the refs; blocks mic input while playing).

## The F1/F2 coordinate space

All formant math uses one shared standard space; respect it in new code:

- **F1: 200–1000 Hz** = jaw openness (low F1 = high tongue / closed jaw)
- **F2: 600–2500 Hz** = tongue backness (low F2 = back tongue)
- **Neutral schwa = (500, 1500)** — used as drift target, glide anchor, and idle state everywhere
- Values are clamped to these ranges in the worklet and after normalization; visualizers invert axes when mapping to screen.

Phoneme target data (7 minimal pairs with F1/F2/cues) lives in the exported `MINIMAL_PAIRS` constant at the top of `pronunciation-coach.tsx`. The `README.md` contains the full phonetic design spec (phoneme coverage matrix, feedback heuristics) — consult it before changing targets or feedback thresholds.

## Gotchas

- **`next.config.ts` HMR block:** the webpack config supports a `DISABLE_HMR=true` env var that disables all file watching (used in AI Studio so agent edits don't cause flicker). Do not modify or remove that block.
- **Worklet changes are not hot-reloaded or type-checked:** `public/worklets/formant-processor.js` is served statically. After editing it, restart the dev server and hard-refresh. It's outside the TS/ESLint pipelines, so errors only surface at runtime in the audio thread.
- **Mic permissions and browsers:** the app is useless without `getUserMedia` + AudioWorklet; test in Chrome/Edge over localhost or HTTPS. `metadata.json` declares the `microphone` frame permission for the AI Studio hosting context.
- **`reactStrictMode: true`** — effects run twice in dev; the audio setup/teardown code is written to tolerate this, keep cleanup symmetric (see `startRecording`/`stopRecording`).
- `next.config.ts` sets `eslint.ignoreDuringBuilds: true`, but `typescript.ignoreBuildErrors: false` — type errors block builds, lint errors don't.
- The `.env.example` reflects the AI Studio heritage (`GEMINI_API_KEY` server injection); actual code reads `NEXT_PUBLIC_GEMINI_API_KEY` (client) and `OPENROUTER_API_KEY` (server route).
- `motion` package is the framer-motion successor imported as `motion/react` and must stay in `transpilePackages` in `next.config.ts`.
- `tsconfig` maps `@/*` to the repo root (so `@/components/...`, `@/lib/...`).

## Conventions

- All UI components are client components (`'use client'` at top); no server components beyond the root layout/page.
- Tailwind CSS **v4** via `@tailwindcss/postcss` — there is no `tailwind.config`; theme/config lives in CSS (`app/globals.css` starts with `@import "tailwindcss"`). Styling is inline utility classes; visual language: slate/indigo palette, white cards with `rounded-2xl shadow-sm border border-slate-200`.
- Icons come from `lucide-react`; animations from `motion/react` (UI) and `gsap` (SVG attr morphing, elastic returns in the visualizers); 3D from `@react-three/fiber` + `drei`.
- `cn()` exists in `lib/utils.ts` (clsx + tailwind-merge) but most components use template-literal class names — either is acceptable; match the surrounding code.
- Commits use conventional-ish prefixes (`feat:`, `fix:`) with concise imperative summaries.
