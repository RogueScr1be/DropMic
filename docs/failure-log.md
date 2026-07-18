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

## 2026-07-18 — Simulator dev client attached to an unrelated Metro bundle

- Symptom: direct launch of the installed MicDrop development client displayed a `fast-food-v3` `expo-keep-awake` module error.
- Cause: the development client retained or resolved an unrelated Metro bundle on the shared LAN port; no native UI automation was available to select the MicDrop URL.
- Resolution: restarted MicDrop Metro, cleared and reinstalled the simulator app, and verified the limitation persisted. Simulator interaction was not claimed; physical iPhone audio remains the required native gate.

## 2026-07-18 — Browser acceptance harness initially missed the required 30-second target

- Symptom: the first reinforced Chromium attempt waited for automatic completion while the default duration was 60 seconds and the test timeout was 30 seconds.
- Cause: the acceptance test did not select 30 seconds before starting and used a timeout shorter than the required duration.
- Resolution: selected the 30-second option and extended only the test timeout. The final Chromium run passed automatic stop, output-size, MIME, interruption, playback, deletion, and retry checks.

## 2026-07-18 — Native and Safari validation unavailable in this pass

- iPhone, Android, iPad, and Safari require a real device/browser manual run.
- No platform result is claimed until those checks are performed.

## 2026-07-18 — Stale Metro collision during R0B preflight

- Symptom: an unrelated `fast-food-v3` Expo process was running `expo run:ios --device` and could serve the wrong bundle to a MicDrop development client.
- Cause: shared local Metro processes and ports were not scoped to the repository.
- Resolution: stopped the unrelated processes before MicDrop validation and added a fixed-port, cache-clearing launcher.
- Durable guardrail: from `/Users/thewhitley/MicDrop`, run `npm run start:micdrop`; verify `http://127.0.0.1:8082` before launching a simulator. Stop any other Expo/Metro process first.

## 2026-07-18 — Repeat attempts re-requested permission from the ready state

- Symptom: after an interruption or completed take, the next first-use attempt could fail closed when the UI revalidated microphone permission.
- Cause: the R0A state machine accepted permission requests only from `idle` and `permission_denied`, while R0B intentionally rechecks permission before every local attempt.
- Resolution: allow `ready:REQUEST_PERMISSION` to enter the existing permission boundary; no adapter change was required.
- Regression coverage: recording-machine test covers pre-permission duration selection, denial, and a subsequent permission request.

## 2026-07-18 — Late attempt callbacks could race a retry

- Symptom: a stop, start, or interruption callback from the previous attempt could arrive after retry and mutate the new attempt.
- Cause: asynchronous audio operations outlived the UI attempt that started them.
- Resolution: the screen now invalidates an operation generation on retry/delete/interruption and checks it before committing asynchronous results.
- Regression coverage: existing stale-completion state-machine coverage plus Chromium interruption/retry acceptance.
