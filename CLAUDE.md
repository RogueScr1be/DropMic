# MicDrop engineering contract

- Read `AGENTS.md` and the pinned Expo SDK docs before changing platform code.
- Keep R0A local-only: no Supabase, uploads, transcription, analytics, or background recording.
- Keep recording transitions explicit and fail closed; derive elapsed time from timestamps.
- Keep Zustand limited to transient UI/session state. Put testable rules in pure TypeScript.
- Validate with `npm run typecheck`, `npm run lint`, `npm test`, `npm run web:export`, and `git diff --check`.
- Do not claim native or Safari support without a real-device/manual result.
