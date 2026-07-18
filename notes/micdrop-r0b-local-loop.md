# MicDrop R0B — Local First-Use Loop

## Scope

R0B adds the local first-use experience only: splash, deterministic topic reveal, duration choice, countdown, the existing local recording flow, completion, retry, deletion, and a non-uploading Quick Read placeholder.

## Component boundaries

- `src/app/index.tsx` owns local phase orchestration and binds the existing recording store/adapter to the UI.
- `src/features/topics/topic-catalog.ts` owns the bundled topic catalog and seeded selection rules.
- `src/features/solari/SolariBoard.tsx` owns split-flap presentation, reduced-motion fallback, and completion gating.
- `src/features/first-use/` owns phase/timer helpers, splash presentation, and reduced-motion subscription.
- `src/features/recording/` remains the local audio/state-machine boundary; the audio adapter was not changed in R0B.

## Runtime contract

`launch → topic_reveal → duration_selection → countdown → recording → completion`

Durations remain 30, 60, and 90 seconds. Recording elapsed time continues to derive from timestamps. A generation guard prevents late permission, start, stop, or interruption callbacks from mutating a retried attempt.

## Validation

- Chromium local-loop acceptance: passed, including automatic 30-second stop, local blob existence/non-zero size, runtime MIME assertion, playback, Quick Read placeholder, deletion, interruption, retry, and explicit stop.
- Chromium responsive acceptance: passed at 390px, 834px, and 1440px widths with no horizontal overflow.
- Unit suite: 21 tests passed across five suites.
- Typecheck, lint, production web export, and `git diff --check`: passed.
- iPhone 16 simulator and iPad Pro 13-inch simulator Release builds passed on iOS 26.2; simulator interaction and native audio acceptance remain unverified.

## Launch guardrail

Use `npm run start:micdrop` from the repository root. It uses the MicDrop dev-client profile, port 8082, and a cleared Metro cache. Confirm the served bundle is MicDrop before launching a simulator.
