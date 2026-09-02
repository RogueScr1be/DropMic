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

## 2026-08-17 — Lock the DropMic monetization contract before purchase work

### Decision

The complete R0E contract is recorded in [notes/r0e-monetization-contract.md](/Users/thewhitley/MicDrop/notes/r0e-monetization-contract.md). DropMic Free, DropMic Plus, and permanent Skill Packs remain economically separate. Plus does not grant Packs, and Pack ownership does not grant Plus.

R0F Purchase Foundation is blocked until the core lifecycle production-repair gate and the minimum Free-product gate are accepted. The August 31 paid-release target is withdrawn pending evidence-based replanning.

### Alternatives considered

- Begin RevenueCat and paywall work immediately from the earlier August schedule.
- Build all missing Free features, Packs, and commerce in one combined milestone.
- Lock the product, identity, entitlement, privacy, and sequencing contracts first.

### Tradeoffs

The documentation gate delays purchase implementation but prevents product, pricing, entitlement, and retention assumptions from becoming runtime contracts. The minimum Free gate intentionally narrows launch scope; challenges, richer history, Mic Saves, and expanded content remain separately prioritized.

### Refactor triggers

Revisit the contract only when pricing, Pack scope, store configuration, or the retention/account-deletion model changes. Do not create a parallel customer identity or permit client-only paid access.

## 2026-08-17 — Use the stable Supabase UUID as the future purchase identity

### Decision

The stable `auth.users.id`/owner UUID is the sole future purchase identity and will become the RevenueCat App User ID. Anonymous-to-email conversion must preserve it; no parallel customer-account system is allowed.

### Alternatives considered

- Generate a separate RevenueCat customer ID.
- Key purchases by email address.
- Reuse the existing stable Supabase UUID.

### Tradeoffs

The UUID preserves identity across email conversion and aligns provider access with server ownership. Account deletion must later define cleanup of RevenueCat identity, entitlement mirrors, metrics, transcripts, audio, and Storage.

### Refactor trigger

Revisit only if Supabase identity cannot remain stable across an approved auth migration.

## 2026-08-17 — Keep paid access server-authoritative

### Decision

Cached client entitlement state may affect display only. The server must resolve Plus status, Pack ownership, quotas, rubric access, and refund/revocation/expiration state before paid provider access.

### Alternatives considered

- Gate paid features only in the client.
- Treat RevenueCat client state as the authorization boundary.
- Mirror and resolve entitlement state server-side.

### Tradeoffs

Server resolution adds implementation and synchronization work but prevents modified clients from bypassing paid gates and keeps provider cost bounded.

### Refactor trigger

Revisit only if a reviewed server-side authorization design proves equivalent enforcement under offline and revocation conditions.

## 2026-08-17 — Persist derived progress without extending raw-audio retention

### Decision

Paid value may persist derived metrics and coaching signals, but Plus must not extend successful-audio, failed-audio, or transcript retention boundaries. `KEEP THIS TAKE` is deferred until explicit consent, individual deletion, storage management, and account-deletion behavior exist.

### Alternatives considered

- Retain raw audio for Plus users.
- Store only ephemeral feedback.
- Persist derived signals while keeping audio/transcript TTLs unchanged.

### Tradeoffs

Derived progress supports Take Two and long-term improvement without turning raw voice recordings into a permanent library. It requires versioned metrics and deletion-aware account design.

### Refactor trigger

Revisit only through an explicit retention and storage-management contract.

## 2026-08-17 — Make Take Two the central paid mechanism

### Decision

Take Two comparison is the central Plus value proof: one useful correction followed by an observable second attempt. The primary product metric is feedback-to-second-take rate, followed by targeted-behavior improvement.

### Alternatives considered

- Lead with generic confidence scores.
- Lead with an open-ended AI coach.
- Lead with correction-to-Take-Two improvement.

### Tradeoffs

Take Two is narrower and requires calibrated observable metrics, but it is testable and aligned with the product loop. Opaque composite scores and sensitive inference remain excluded.

### Refactor trigger

Revisit if controlled product evidence shows a different repeatable behavior is a stronger value proof.

## 2026-08-17 — Block R0F behind lifecycle and minimum Free gates

### Decision

Before RevenueCat implementation, Gate A must repair attempt identity, scheduled cleanup, Storage deletion, deletion verification, and timeout bounds. Gate B must establish the minimum Free foundation: named Cold Take, Freestyle, minimum Interview Basics and Student Basics content, Mic Flow, recent history, feedback-to-retry, and focused core-loop analytics.

### Alternatives considered

- Start R0F immediately.
- Bundle every missing Free feature into one large milestone.
- Repair production lifecycle behavior and define a minimum Free foundation first.

### Tradeoffs

The gates reduce parallelism and delay commerce, but they protect user data and ensure paid work is attached to a launchable Free loop. Challenges, richer history, Mic Saves, and expanded content remain separate decisions.

### Refactor trigger

Replan only after both gates have evidence-backed acceptance criteria and results.

## 2026-08-17 — Separate core cleanup hardening from production retention operations

### Decision

R0D-D2A Core keeps the existing `quick-read-cleanup` Edge Function as a bounded, deterministic cleanup path and uses the shared Storage verifier for exact-path deletion evidence. Successful Quick Read analysis cannot complete until audio is deleted or metadata-confirmed absent. Expired audio, expired transcripts, and orphaned Storage objects are processed in bounded batches with stable ordering; transcripts are deleted without removing durable results or metrics.

The deployed function authentication contract remains represented in `supabase/config.toml`: `quick-read-cleanup` uses its dedicated header secret with the platform JWT pre-check disabled. No scheduler credentials or Vault values are added to the repository.

### Deferred D2-A Ops

The 24-hour failed-audio and 30-day transcript guarantees are not automatically enforced yet. Supabase Cron/`pg_cron`, `pg_net`, Vault provisioning, schedule observability, and full synthetic live-retention acceptance are deferred until immediately before external testing. Current Edge secret values are unknown and must be coordinated in that later gate; no real-user or paid launch may occur until D2-A Ops, D2-B, and D2-C pass.

### Refactor trigger

Return to D2-A Ops once the product is ready for external testing. Keep the scheduler, Vault, and live acceptance work separate from Premium and from feature construction.

## 2026-09-01 — Establish the R0F-B Plus entitlement authority boundary

### Decision

Select RevenueCat as the future iOS-first purchase provider, behind a narrow
provider adapter. R0F-B adds only the server-owned
`public.billing_entitlements` current-state table for the single `plus`
entitlement. It does not install RevenueCat, expose a paywall, add purchases or
webhooks, or make paid access live. The stable Supabase `auth.users.id` remains
the future purchase identity, and server-side authorization must resolve from
this state rather than client entitlement state.

### Alternatives considered

- Install the purchase SDK and build the paywall before the Free foundation and
  Premium value proof are ready.
- Add a generic commerce schema or webhook-event ledger before either has a real
  consumer.
- Trust RevenueCat client state as the authorization boundary.

### Tradeoffs

One current-state row keeps the first server boundary small and reversible. It
does not yet provide purchase synchronization, event idempotency, refunds, or
restore behavior; those belong to the later adapter/webhook phase. RevenueCat's
planned cost remains zero until provider usage begins under the accepted pricing
assumption (free through $2,500 monthly tracked revenue, then 1%).

### Refactor trigger

Add the webhook event ledger only when webhook handling is implemented. Do not
expose a paywall until Free Gate B and the server-gated Take Two capability are
accepted.

## 2026-09-01 — Define the R0F-C server-gated Take Two capability

### Decision

Take Two is implemented first as a local-only, read-only Edge Function behind
the R0F-B server-authoritative Plus resolver. It authenticates with the
verified Supabase user, uses `attempts.topic_id` as the existing stored prompt
identity, reads only durable results and metrics, and returns canonical
baseline/follow-up snapshots with raw deltas. It makes no AI/provider calls,
Storage or transcript reads, or database writes.

### Alternatives considered

- Accept client-supplied owner, prompt, entitlement, metric, or comparison data.
- Compare runs by request order or invent a directional improvement score.
- Add a comparison table before the existing attempt/run identity can prove
  same-prompt membership.

### Tradeoffs

Using the existing attempt-to-topic relationship keeps the phase schema-free
and reversible, while requiring complete durable result/metric state means
malformed or partial runs return `comparison_unavailable`. This proves the
Premium value boundary locally but does not expose paid access until live
authorization, deployment, and Take Two acceptance run together.

### Refactor trigger

Revisit the comparison contract only if the stored prompt identity or metric
semantics change. Keep RevenueCat purchase plumbing, restore/refund handling,
and UI after the combined R0F-B2/R0F-C live gate.
