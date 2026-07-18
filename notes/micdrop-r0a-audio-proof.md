# MicDrop R0A — Audio proof record

## Scope

This phase proves only local recording, local playback, retry, deletion, permission denial, interruption recovery, and disabled background recording.

Initial supported development targets are Chromium desktop, iPhone, and iPad. Android and Safari compatibility are explicitly deferred until after the local first-use loop is complete.

Excluded: onboarding, authentication, Supabase, uploads, transcription, analysis, analytics, streaks, sharing, packs, and final visual design.

## Contract

- Durations: 30, 60, and 90 seconds.
- Audio remains local.
- Timer display derives from `startedAtMs` and `Date.now()`; interval ticks only trigger checks.
- Background recording is disabled in `app.json` and at runtime.
- Invalid state transitions fail closed.
- Reduced-motion support is represented by an animation-neutral accessible UI and remains a required constraint for later visual work.

## Formats

- iOS: expected AAC in an M4A container from `RecordingPresets.HIGH_QUALITY`; no native file was produced in this validation pass.
- Android: expected AAC/MPEG-4 in an M4A container from `RecordingPresets.HIGH_QUALITY`; no Android file was produced in this validation pass.
- Chromium: runtime capability selection and the returned Blob reported `audio/webm;codecs=opus`; the Blob size was non-zero.
- iPhone/iPad: no native file properties were captured because physical iPhone audio acceptance was unavailable.
- Android/Safari: deferred; no compatibility claim is made.

The native formats are Expo SDK 57 preset expectations, not acceptance evidence. Deferred platforms require a compatibility pass before public beta or App Store release.

## Validation matrix

| Platform | Result | Evidence |
|---|---|---|
| Chromium desktop | PASS — automated prioritized target | Chrome 150.0.7871.115; permission, automatic 30s stop, non-zero Blob, runtime MIME, playback, deletion, interruption, retry |
| Physical iPhone | NOT TESTED — release gate open | No physical iPhone connected; native audio acceptance is not claimed |
| iPhone simulator | DEFERRED EXECUTION — build only | iPhone 16e simulator, iOS 26.2; simulator app launch attached to a stale unrelated Metro bundle and no native UI driver was available |
| iPad simulator | DEFERRED EXECUTION — build only | iPad Pro 13-inch (M5) simulator, iOS 26.2; native build succeeded, but responsive/state-flow interaction was not executable |
| Physical iPad | NOT PERFORMED | Optional for this gate; physical audio remains a later QA item |
| Android phone | DEFERRED | Explicitly deferred until after the local first-use loop |
| Safari desktop/mobile | DEFERRED | Explicitly deferred until after the local first-use loop |

## Automated validation

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test -- --coverage=false`: passed, 12 tests.
- `npm run test:browser`: passed, Chromium fake-microphone flow including permission, automatic 30s stop, non-zero output, runtime MIME, playback, deletion, interruption, and retry.
- `npm run web:export`: passed; static web export generated successfully.
- `git diff --check`: passed before commit.
- `xcodebuild -workspace ios/MicDrop.xcworkspace -scheme MicDrop -configuration Debug -destination 'id=2DF9EE41-7FC2-472E-8252-DC3EFFA294AD' build`: passed for iPad simulator; two existing Xcode Metal toolchain-path warnings.

## R0A.2 acceptance distinction

Chromium is accepted for the prioritized development target. Physical iPhone audio acceptance remains open. iPhone and iPad simulator builds are available, but simulator evidence does not cover microphone hardware, native interruptions, codecs, or file integrity. The simulator UI checks were not completed because the dev client attached to an unrelated stale Metro bundle and macOS accessibility injection was unavailable.

The unit suite covers the state contract, timer boundaries, denial, interruption during countdown and recording, invalid repeated start/early stop/delete transitions, playback failure state, and stale completion after retry. R0B remains blocked until physical iPhone audio acceptance and the required iPhone/iPad simulator UI checks are completed.

## Dependency audit

`npm audit --json` reported 11 moderate findings and no high or critical findings. All 11 are in Expo CLI/config/prebuild/build tooling: `@expo/cli`, `@expo/config`, `@expo/config-plugins`, `@expo/inline-modules`, `@expo/local-build-cache-provider`, `@expo/metro-config`, `@expo/prebuild-config`, `expo`, `expo-splash-screen`, `uuid`, and `xcode`. They are transitive in the installed tree except for the direct `expo` and `expo-splash-screen` packages whose vulnerable paths are their build/config subtrees. None is evidenced as reachable from shipped recording runtime code. Audit-suggested fixes are major Expo 46/splash 55 downgrades; no non-breaking remediation was offered, so no audit fix was applied. This remains a CI/local prebuild risk to revisit on an Expo upgrade.

## Side effects, cost, and rollback

- Side effects: generated ignored `ios/` native files, installed CocoaPods, built simulator artifacts, started/stopped local Metro servers, and left no tracked prebuild configuration changes.
- Cost impact: no cloud services, uploads, analytics, or paid APIs used; local build/test CPU and disk only.
- Blast radius: recording state machine, local adapter interruption cleanup, browser MIME capability selection, and their tests; no backend or product-flow changes.
- Rollback: `git revert HEAD`; generated ignored `ios/` files may be removed separately only if the local native build is no longer needed.
- Acceptance commit: report the immutable hash from `git rev-parse HEAD` after commit creation.

## Deferred compatibility track

Android and Safari are temporary unsupported targets. Revisit before public beta or App Store release. Remove the limitation only after each platform has a focused permission, recording, playback, interruption, deletion, retry, file-property, and format validation pass with no critical or high findings.

## Required manual run

On a physical iPhone, run 30s, 60s, and 90s recordings; stop manually; allow automatic duration stop; play; retry; delete; deny permission; background the app during recording; and verify the interrupted state. Record the actual URI/container format, codec, duration, and non-zero size in this file before unblocking R0B. Physical iPad audio is preferred but optional for this gate.
