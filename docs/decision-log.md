# Decision log

## 2026-07-18 — Cloud batch transcription after explicit consent

MicDrop will use cloud batch transcription after explicit user analysis consent rather than requiring on-device transcription for every MVP platform.

### Context

R0A proves local capture and playback only. Audio formats, browser support, device performance, and native model packaging differ across iPhone, Android, iPad, Chromium, and Safari. Transcription is not required to prove the first speaking repetition.

### Alternatives considered

- On-device transcription on every platform.
- Cloud streaming transcription during recording.
- Cloud batch transcription after the recording is complete and the user opts into analysis.

### Tradeoffs

Cloud batch transcription keeps the recording loop small, avoids platform-specific model packaging, and allows cost/retention controls. It introduces upload latency, privacy/consent requirements, provider cost, and a future backend dependency. On-device transcription would improve offline privacy but increases binary size, battery use, model maintenance, and cross-platform parity risk. Streaming is unnecessary for the first analysis slice and creates higher latency and cost complexity.

### Refactor trigger

Revisit this decision if offline transcription becomes a contractual requirement, privacy policy prohibits cloud processing, analysis latency exceeds the product target, or recurring transcription cost exceeds the approved per-recording budget.

## 2026-07-20 — Temporary us-west-2 development region

MicDrop will use the linked `us-west-2` Supabase project only for disposable development and R0C acceptance. Production region selection remains open.

### Context

The requested North Virginia region is normally `us-east-1`, but the authenticated project listing identifies the disposable MicDrop project as `us-west-2`. Moving or recreating the project during security acceptance would invalidate the current migration and RLS evidence.

### Alternatives considered

- Move or recreate the development project in North Virginia before acceptance.
- Continue acceptance against the confirmed disposable `us-west-2` project and make the production region decision before release.

### Tradeoffs

Continuing preserves a stable, non-production target and avoids introducing migration drift during acceptance. The tradeoff is that latency, residency, and operational assumptions for production remain unverified against the final region.

### Production revisit trigger

Select and provision the production region before TestFlight or public beta, with explicit review of data residency, latency, compliance, and migration strategy. Do not place production user data in the temporary development project.

## 2026-07-18 — Runtime web recording MIME capability selection

The local recording adapter probes `MediaRecorder.isTypeSupported` and selects the first supported audio MIME type, preferring WebM/Opus and then MP4/AAC. It no longer relies on `audio/webm` being accepted by every browser.

### Context

Expo’s SDK 57 high-quality preset names `audio/webm` for web, while browser MediaRecorder support varies. Safari acceptance was unavailable in this run, so the adapter records only the runtime-selected capability and leaves the actual Safari output unclaimed.

### Alternatives considered

- Keep the preset’s static `audio/webm` value.
- Add Safari-specific UI/platform branches.
- Detect capabilities inside the recording adapter.

### Tradeoffs

Adapter-local capability detection preserves the UI contract and lets Chromium, Safari, and future browsers select their supported container. The actual returned Blob MIME, extension, codec, duration, and size still require platform execution to verify.

### Refactor trigger

Revisit when Expo exposes the actual MediaRecorder MIME/container through its public adapter API or when Safari and Chromium acceptance evidence establishes a single supported format.

## 2026-07-18 — Prioritized iOS and Chromium support; defer Android and Safari

MicDrop’s initial supported development targets are Chromium desktop, iPhone, and iPad. Android and Safari compatibility are deferred until after the local first-use loop is complete.

### Context

Chromium automated recording is green, and the shared iOS adapter can be built for iPhone and iPad. This environment has no physical iPhone and cannot execute Safari automation. A simulator cannot establish microphone hardware, native interruption, codec, or file-integrity acceptance.

### Tradeoffs

Prioritizing Chromium and iOS keeps R0B focused on the local first-use loop while preserving the shared adapter and avoiding platform-specific business logic. The tradeoff is an explicit temporary support limitation and residual Android/Safari compatibility risk.

### Risk

Android may expose permission, media-service, or file-format differences. Safari may select a different MediaRecorder container or MIME type. These risks do not affect local-only R0B development but do affect public release readiness.

### Revisit trigger

Revisit before public beta or App Store release, or earlier if a prioritized-platform change touches the shared recording adapter.

### Removal criteria

Remove the limitation only after focused Android and Safari validation covers permission, recording, automatic stop, playback, interruption, retry, deletion, non-zero file output, actual file properties, and runtime format, with no critical or high security findings.

## 2026-08-16 — Keep R0D-C live acceptance independent of email

### Decision

The R0D-C development harness creates a unique confirmed synthetic Supabase user with a server-only service-role key, signs that user in through the public client, runs all lifecycle checks under normal RLS, and deletes the user through the normal account-deletion path with an admin deletion fallback.

### Rationale

R0C already accepted the production OTP/Auth delivery path. Reusing email delivery for lifecycle hardening adds an unrelated external dependency and can obscure retry, cleanup, and deletion failures.

### Guardrails

The service-role key is accepted only by the Node development harness and never by Expo code, browser code, or production auth. The synthetic account uses a non-deliverable unique address, `email_confirm: true`, and a generated password. No SMTP, OTP template, RLS, quota, or production Auth behavior changes are allowed.

## 2026-08-16 — Permit persisted-transcript feedback retries

### Decision

The analysis-run state machine permits `uploading → analyzing` when a feedback retry resumes after a transcript was already persisted.

### Rationale

The retry loop intentionally skips transcription when the transcript exists. Requiring a second transcription state would add unnecessary work and could violate the provider idempotency contract. The transition remains non-terminal and the two-retry limit is unchanged.

## 2026-07-18 — Metadata-only local attempt claim

Completed attempts are claimed with topic, selected duration, completed duration, completion time, and a client id. The local URI is deliberately excluded from Postgres and `audio_retained` is forced false for R0C.

### Context

R0B audio remains local. R0C needs account continuity without introducing storage, upload consent, or raw voice-data handling.

### Alternatives considered

- Upload and claim the audio file.
- Store a local URI path in Postgres.
- Store only non-sensitive attempt metadata.

### Tradeoffs

Metadata-only claims survive restart and OTP delay while preserving the local audio boundary. They cannot support server-side playback or analysis until a separately consented upload phase is designed. `client_attempt_id` makes retries idempotent.

### Refactor trigger

Revisit only when an explicit analysis/upload consent flow, retention policy, storage bucket, and deletion contract are approved.

## 2026-07-18 — Preserve the anonymous user during email conversion

R0C converts the active anonymous session with `auth.updateUser({ email })` and verifies using the `email_change` OTP type. It does not use a new-user `signInWithOtp` path for conversion.

### Context

The first completed local attempt must remain attributable to the same Supabase user after email verification.

### Alternatives considered

- Create a second user with `signInWithOtp({ shouldCreateUser: true })`.
- Convert the current session with `updateUser`.

### Tradeoffs

Current-session conversion preserves identity and makes claim idempotency straightforward. It depends on Supabase email-change OTP configuration and must be exercised against a real/local Auth service before release.

### Refactor trigger

Revisit if the configured Supabase Auth version cannot verify email-change OTPs or if product later requires an account-linking flow across providers.

## 2026-07-18 — Client-side account deletion uses a security-definer RPC

The client calls `public.delete_my_account()` with the user session; the function deletes `auth.users`, allowing foreign-key cascades to remove profiles, preferences, and attempts. No service-role key enters the app.

### Context

Supabase client SDKs cannot safely call `auth.admin.deleteUser` without a service-role secret.

### Tradeoffs

The RPC keeps deletion owner-scoped and removes all user metadata in one call, but it requires hosted/local Supabase execution to verify function ownership and Auth privileges.

### Refactor trigger

Move deletion to a reviewed Edge Function only if the target Supabase deployment disallows the security-definer function or requires an audited deletion workflow.
