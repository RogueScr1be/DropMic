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

- iOS: expected AAC in an M4A container from `RecordingPresets.HIGH_QUALITY`; no native file was produced in this validation pass.
- Android: expected AAC/MPEG-4 in an M4A container from `RecordingPresets.HIGH_QUALITY`; no Android file was produced in this validation pass.
- Chromium: runtime capability selection chose `audio/webm;codecs=opus`; the browser test did not expose the Blob for independent byte-size/container inspection.
- Safari: actual MIME type remains unknown because Safari automation was unavailable and no manual Safari recording was executed.

The native formats are Expo SDK 57 preset expectations, not acceptance evidence. Safari must be revalidated before claiming a supported MIME type.

## Validation matrix

| Platform | Result | Evidence |
|---|---|---|
| Chromium desktop | PASS — automated flow | Chrome 150.0.7871.115; fake microphone; permission, record/stop, playback, delete, retry |
| iPhone | NOT ACCEPTANCE-TESTED — simulator build only | iPhone 16e simulator, iOS 26.2; build/install succeeded, URL confirmation sheet could not be accepted because macOS accessibility injection was unavailable |
| Android phone | NOT TESTED | `adb`/Android SDK unavailable; no physical Android device connected |
| iPad | NOT ACCEPTANCE-TESTED — simulator build only | iPad Pro 13-inch (M5) simulator, iOS 26.2; `xcodebuild` succeeded, no UI/audio interaction executed |
| Safari desktop/mobile | NOT TESTED | Safari 26.6 installed; SafariDriver refused a session until “Allow Remote Automation” is enabled interactively |

## Automated validation

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test -- --coverage=false`: passed, 12 tests.
- `npm run test:browser`: passed, Chromium fake-microphone flow including permission, stop, playback, delete, and retry.
- `npm run web:export`: passed; static web export generated successfully.
- `git diff --check`: passed before commit.
- `xcodebuild -workspace ios/MicDrop.xcworkspace -scheme MicDrop -configuration Debug -destination 'id=2DF9EE41-7FC2-472E-8252-DC3EFFA294AD' build`: passed for iPad simulator; two existing Xcode Metal toolchain-path warnings.

## Acceptance matrix detail

The required first-run denial/retry, 30/60/90-second physical recording, automatic stop, playback file size/codec/duration, backgrounding, media-service reset, and rapid-tap checks are not all executed on a real device or Safari. The unit suite covers the state contract, timer boundaries, denial, interruption during countdown and recording, invalid repeated start/early stop/delete transitions, playback failure state, and stale completion after retry. Chromium covers the local flow but uses explicit stop rather than waiting 30/60/90 seconds.

## Dependency audit

`npm audit --json` reported 11 moderate findings and no high or critical findings. All 11 are in Expo CLI/config/prebuild/build tooling: `@expo/cli`, `@expo/config`, `@expo/config-plugins`, `@expo/inline-modules`, `@expo/local-build-cache-provider`, `@expo/metro-config`, `@expo/prebuild-config`, `expo`, `expo-splash-screen`, `uuid`, and `xcode`. They are transitive in the installed tree except for the direct `expo` and `expo-splash-screen` packages whose vulnerable paths are their build/config subtrees. None is evidenced as reachable from shipped recording runtime code. Audit-suggested fixes are major Expo 46/splash 55 downgrades; no non-breaking remediation was offered, so no audit fix was applied. This remains a CI/local prebuild risk to revisit on an Expo upgrade.

## Side effects, cost, and rollback

- Side effects: generated ignored `ios/` native files, installed CocoaPods, built simulator artifacts, and left no tracked prebuild configuration changes.
- Cost impact: no cloud services, uploads, analytics, or paid APIs used; local build/test CPU and disk only.
- Blast radius: recording state machine, local adapter interruption cleanup, browser MIME capability selection, and their tests; no backend or product-flow changes.
- Rollback: `git revert HEAD`; generated ignored `ios/` files may be removed separately only if the local native build is no longer needed.
- Acceptance commit: report the immutable hash from `git rev-parse HEAD` after commit creation.

## Required manual run

For each native platform and Safari, run 30s, 60s, and 90s recordings; stop manually; allow automatic duration stop; play; retry; delete; deny permission; background the app during recording; and verify the interrupted state. Record the actual URI/container format, codec, duration, and non-zero size in this file before unblocking R0B.
