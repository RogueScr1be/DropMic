# Failure log

## 2026-07-18 — Expo dependencies were not installed after scaffold

- Symptom: `npx expo install` could not determine the Expo SDK version.
- Cause: the foundation was intentionally created with `create-expo-app --no-install`.
- Resolution: ran `npm install` before adding SDK-compatible dependencies.
- Prevention: run dependency installation before any Expo CLI command that resolves project modules.

## 2026-07-18 — Countdown interruption could leave a stale start callback

- Symptom: backgrounding during the 600 ms countdown left the timer callback able to call `audio.start()` and dispatch completion after the state had changed.
- Cause: interruption handling only watched `recording`, and the delayed callback did not verify that the state was still `countdown`.
- Resolution: countdown is now interruptible, its timer is cleared, stale callbacks fail closed and stop any late-started recorder, and interrupted recordings are deleted after stop when a URI is returned.
- Regression coverage: state-machine test for countdown interruption and the stale callback contract.

## 2026-07-18 — Rapid double-tap could dispatch an invalid second start

- Symptom: two start taps in quick succession could send `BEGIN_COUNTDOWN` twice; the store correctly failed closed into `error`, but the user-visible result was not a safe no-op.
- Cause: the start handler had no in-flight guard while permission/preparation was asynchronous.
- Resolution: added a start in-flight guard plus a current-state check before beginning countdown.
- Regression coverage: repeated-start transition test and Chromium flow.

## 2026-07-18 — Playback and local deletion errors were not surfaced

- Symptom: failed playback initialization or a failed file deletion could reject outside the state machine, leaving the UI in `completed` without an actionable error.
- Cause: `seekTo`, playback, and deletion promises were not handled by the screen.
- Resolution: await playback seek, catch playback/deletion failures, and route completed-state failures to `error` while retaining the local URI for retry.
- Regression coverage: completed playback-failure state test.

## 2026-07-18 — Safari acceptance execution blocked by local automation policy

- Symptom: SafariDriver 26.6 refused to create a session.
- Cause: Safari requires “Allow Remote Automation” to be enabled interactively; `safaridriver --enable` requested an administrator password that was not available to this run.
- Resolution: no Safari result or MIME claim was made. Manual Safari validation remains a release gate.

## 2026-07-18 — Native behavior execution blocked after simulator build

- Symptom: the iPhone simulator opened an “Open in MicDrop?” URL confirmation sheet that could not be accepted.
- Cause: macOS accessibility event injection was unavailable in this environment.
- Resolution: iPhone 16e simulator and iPad Pro 13-inch simulator were build-verified only; no native recording behavior was claimed.

## 2026-07-18 — Native and Safari validation unavailable in this pass

- iPhone, Android, iPad, and Safari require a real device/browser manual run.
- No platform result is claimed until those checks are performed.
