# MicDrop engineering contract

- Read `AGENTS.md` and the pinned Expo SDK docs before changing platform code.
- Keep R0A local-only: no Supabase, uploads, transcription, analytics, or background recording.
- Keep recording transitions explicit and fail closed; derive elapsed time from timestamps.
- Keep Zustand limited to transient UI/session state. Put testable rules in pure TypeScript.
- Treat countdown callbacks and local-file cleanup as asynchronous failure boundaries; verify current state before committing late callbacks.
- Use runtime `MediaRecorder.isTypeSupported` in the audio adapter; never document Safari MIME support from the Expo preset alone.
- Keep deferred platform support explicit in decision and failure logs; do not add platform-specific business logic to unblock an unavailable device.
- Acceptance browser tests must select their intended duration and allow the full wall-clock boundary before asserting automatic stop.
- Validate with `npm run typecheck`, `npm run lint`, `npm test`, `npm run web:export`, and `git diff --check`.
- Do not claim native or Safari support without a real-device/manual result.
