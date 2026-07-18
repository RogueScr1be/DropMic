# MicDrop R0A — Audio proof record

## Scope

This phase proves only local recording, local playback, retry, deletion, permission denial, interruption recovery, and disabled background recording.

Excluded: onboarding, authentication, Supabase, uploads, transcription, analysis, analytics, streaks, sharing, packs, and final visual design.

## Contract

- Durations: 30, 60, and 90 seconds.
- Audio remains local.
- Timer display derives from `startedAtMs` and `Date.now()`; interval ticks only trigger checks.
- Background recording is disabled in `app.json` and at runtime.
- Invalid state transitions fail closed.
- Reduced-motion support is represented by an animation-neutral accessible UI and remains a required constraint for later visual work.

## Formats

- iOS: expected AAC in an M4A container from `RecordingPresets.HIGH_QUALITY`.
- Android: expected AAC/MPEG-4 in an M4A container from `RecordingPresets.HIGH_QUALITY`.
- Web: expected `audio/webm` from the `MediaRecorder` preset.

These are expected formats from the Expo SDK 57 preset; actual device/browser output must be recorded in the validation matrix.

## Validation matrix

| Platform | Result | Evidence |
|---|---|---|
| Chromium desktop | Pending automated browser run | `e2e/audio-proof.spec.ts` |
| iPhone | Not tested in this environment | Manual device run required |
| Android phone | Not tested in this environment | Manual device run required |
| iPad | Not tested in this environment | Manual device run required |
| Safari desktop/mobile | Not tested in this environment | Manual Safari run required |

## Automated validation

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test -- --coverage=false`: passed, 7 tests.
- `npm run test:browser`: passed, Chromium fake-microphone flow including permission, stop, playback, delete, and retry.
- `npm run web:export`: passed; static web export generated successfully.
- `git diff --check`: passed before commit.

## Required manual run

For each native platform, run 30s, 60s, and 90s recordings; stop manually; allow automatic duration stop; play; retry; delete; deny permission; background the app during recording; and verify the interrupted state. Record the actual URI/container format and result in this file.
