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

## 2026-07-18 — Local Supabase RLS runner unavailable

- Symptom: `npx supabase test db` could not connect to Postgres.
- Cause: Docker is not installed/running in this environment, so the local Supabase database stack could not start.
- Resolution: added the migration and pgTAP checks but did not claim executed RLS, OTP, or deletion behavior. Run `npx supabase start && npx supabase test db` before backend acceptance.
- Prevention: keep a Docker-backed Supabase validation step in the release checklist.

## 2026-07-18 — Dependency audit reports 11 moderate Expo/toolchain findings

- Symptom: `npm audit --json` reports 11 moderate findings.
- Cause: the Expo 57 dependency tree contains `@expo/cli`, config plugins, `xcode`, and `uuid` advisories.
- Classification: `expo` and `expo-splash-screen` are direct package entries; the other nine findings are transitive. The affected CLI/config/Xcode paths are build-time tooling and are not bundled into the shipped JS/native runtime. No non-breaking remediation was available; npm suggested an unrelated major Expo 46 change.
- Resolution: did not run `npm audit fix` or force upgrades. Reclassify after the next supported Expo patch line is available.

## 2026-07-18 — iOS Release build emitted a Metal toolchain path warning

- Symptom: iPhone 16e and iPad Pro 13-inch Release builds succeeded with a warning that a deprecated simulator Metal toolchain search path was missing.
- Cause: Xcode 26.6 simulator toolchain configuration, outside MicDrop source.
- Resolution: no source change; both builds completed with zero errors. Revisit if a future Xcode version turns the warning into a build failure.

## 2026-07-18 — R0C.1 live Supabase acceptance could not start

- Symptom: the repository had no configured development Supabase URL, anon key, CLI access token, or running Docker/Postgres stack.
- Evidence: `npx supabase projects list` returned `LegacyPlatformAuthRequiredError`; environment presence checks were false for all Supabase variables; Docker was unavailable.
- Resolution: ran all local TypeScript, lint, Jest, Chromium, web-export, and diff checks; performed a sanitized static migration review; made no source or ownership workaround and claimed no live Auth, OTP, RLS, or deletion result.
- Prevention: before the next acceptance pass, configure disposable non-production project credentials locally, set OTP redirect URLs, authenticate the CLI, and start Docker for pgTAP.

## 2026-07-19 — R0C.2 public Supabase access works but CLI deployment is blocked

- Evidence: the supplied project endpoint returned HTTP 200 from `/auth/v1/settings`; anonymous sign-ins and email auth were enabled. A disposable anonymous session was created successfully and returned a UUID.
- Blocker: `npx supabase link --project-ref bxoqbbzabubvdbxqquyt` returned `LegacyPlatformAuthRequiredError` because no personal access token was available.
- Resolution: wrote only the supplied public URL, publishable key, and project ref to ignored `.env.local`. Did not push migrations or claim OTP, RLS, ownership, or deletion acceptance.
- Prevention: set `SUPABASE_ACCESS_TOKEN` or complete `npx supabase login` locally, verify the project identity, then run `npx supabase link` and `npx supabase db push`.

## 2026-07-19 — Disposable OTP delivery was not observed

- Flow: created a disposable `mail.tm` mailbox, created an anonymous Supabase session, and called `auth.updateUser({ email })` successfully.
- Symptom: no OTP message arrived during a 90-second poll. A first disposable provider returned HTTP 403 before mailbox creation.
- Resolution: no verification, UUID equality, redirect, or account-conversion claim was made. No source change was made; validate SMTP/provider delivery and Auth email templates after migration deployment.

## 2026-07-20 — Account deletion RPC was executable by anon

- Symptom: live metadata inspection showed `public.delete_my_account()` was `SECURITY DEFINER` with `search_path = ""`, but `has_function_privilege('anon', ..., 'execute')` returned true.
- Cause: the original migration revoked execution from `PUBLIC` but did not explicitly revoke a direct `anon` grant.
- Impact: an unauthenticated role could invoke the high-blast-radius deletion RPC if it had a request path to the function.
- Resolution: stopped deletion testing; added migration `20260720100000_restrict_account_deletion.sql` to explicitly revoke `anon` and `public`, retain execute only for `authenticated`, and deploy it before continuing acceptance.

## 2026-07-20 — Repeated account deletion returned success

- Symptom: after the first live deletion invalidated the session, a second call to `delete_my_account()` returned success instead of an error.
- Cause: the function used `delete from auth.users where id = auth.uid()` without checking whether the JWT subject still existed; zero deleted rows were treated as success.
- Resolution: added `20260720110000_reject_repeated_account_deletion.sql` to require the authenticated subject to exist before deletion, then redeploy and rerun the cascade/repeated-invocation checks.

## 2026-07-20 — Linked development project region differs from requested region

- Evidence: authenticated project listing identifies `MicDrop` as `ACTIVE_HEALTHY` in `us-west-2`.
- Context: the R0C setup requirement specified North Virginia, normally `us-east-1`.
- Resolution: no project move or source change was attempted. Security acceptance continued against the confirmed disposable MicDrop project; owner decision is still required if North Virginia is mandatory.

## 2026-07-20 — R0C.3 OTP delivery proof has no approved mailbox path

- Symptom: the linked MicDrop project has email auth and anonymous sign-ins enabled, but this acceptance environment has neither a verified Resend SMTP configuration available for inspection nor the exact Supabase project-owner email available for a controlled test.
- Impact: no OTP delivery, email verification, anonymous-to-email UUID equality, callback, or post-conversion recovery result can be claimed. The existing `updateUser` request-acceptance result is not delivery evidence.
- Resolution: did not send to an inferred address or reuse a disposable mailbox. Local application checks and the live R0C.2 security harness remain green; acceptance is waiting on approved SMTP/owner-mail configuration.
- Prevention: configure a MicDrop-owned verified sender in Supabase Auth or provide the exact project-owner mailbox before rerunning the final OTP gate. Keep all SMTP credentials in Supabase, never in the client or repository.

## 2026-08-14 — R0D-A Storage policy regex rejected valid owner uploads

- Symptom: the owner could create an `analysis_runs` row, but uploading the server-generated `.wav` object failed with a Storage RLS violation.
- Cause: the foundation migration over-escaped the filename separator as `source\\.`; the valid `source.wav` path did not match the policy regex.
- Resolution: deployed the narrow follow-up migration `20260814000000_r0d_a_storage_policy_regex_fix.sql` with `source\\.` and reran the live owner/cross-user acceptance.
- Guardrail: every Storage RLS regex/pattern change requires a positive owner-upload test plus negative cross-user upload, read, delete, and analysis-start tests before acceptance. A successful Storage delete response with zero deleted objects is a protected no-op, not proof of deletion.

## 2026-08-16 — R0D-B live harness stripped the server-owned Storage folder

- Symptom: the owner-created `analysis_runs` row was valid, but the R0D-B harness received a Storage RLS denial before any provider call.
- Cause: the harness removed the `quick-read/` folder from the server-owned object path before calling Storage. The app correctly uploads the complete `quick-read/{user_id}/{attempt_id}/source.<ext>` path, and the deployed policy intentionally requires that folder.
- Resolution: corrected both live harnesses to pass the complete server-owned path; no RLS policy or application upload contract was changed.
- Prevention: acceptance scripts must use `analysis_runs.audio_object_path` verbatim and must assert that owner upload and cross-user denial are both exercised against that exact path.
