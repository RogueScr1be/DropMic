# MicDrop R0D — Quick Read discovery

Status: R0D-A implementation in progress; live acceptance pending Supabase CLI authentication.

Baseline: R0C is closed at `72baba4`. R0D is limited to one vertical slice:

`local recording → explicit Quick Read consent → private upload → batch transcription → structured Quick Read → raw-audio deletion → result display`

Mic Flow, sharing, packs, payments, persistent coaching memory, and broad analytics are out of scope.

## Locked decisions

- Transcript retention: 30 days, then automatic deletion.
- Failed-analysis audio retention: 24 hours maximum, then automatic purge.
- Provider retry policy: two automatic retries for transient failures. Retries reuse the same analysis identity and do not consume additional daily quota.
- Providers: `gpt-4o-mini-transcribe` for transcription and a nano-class structured text model for Quick Read, both behind replaceable adapters.
- Free quota: three Quick Reads per day.
- Raw audio is never durable product data. Behavioral metrics are durable until account deletion.
- Do not store demographic inference, emotional diagnosis, political-position inference, or sensitive-topic classification in the master metrics layer.

## Current implementation boundary

- `src/app/index.tsx` owns the recording lifecycle and currently writes the completed local attempt to AsyncStorage.
- `src/features/recording/recording-machine.ts` owns permission, countdown, recording, interruption, retry, and deletion transitions.
- `src/features/recording/use-local-audio-recorder.ts` exposes a local URI and platform-specific deletion. It has no upload boundary.
- `src/features/auth/auth-service.ts` claims the local attempt into `public.attempts` only after authenticated onboarding. The current claim is an idempotent upsert keyed by `client_attempt_id`, but it does not yet return `attempts.id`.
- `public.attempts` currently contains owner, topic, selected/completed duration, completion time, and the invariant `audio_retained = false`. There is no Storage bucket, analysis table, quota table, Edge Function, or provider adapter in the repository.
- The current `Get a Quick Read` action opens account setup and still displays the R0B privacy copy that says nothing is uploaded or analyzed. R0D must replace that copy and interaction with an explicit consent boundary.

## Proposed data foundation

### `attempt_metrics`

One durable row per `attempts.id`, with `attempt_id` as the primary key and a unique foreign key to `attempts(id) on delete cascade`:

- `user_id`, `topic_id`, `mode`
- `selected_duration_seconds`, `actual_duration_seconds`
- `word_count`, `words_per_minute`
- `retry_count`, `completed`
- `analysis_requested`, `analysis_completed`
- nullable Quick Read scores: `clarity`, `structure`, `specificity`, `concision`
- nullable `filler_word_count`
- `platform_class`
- `metric_schema_version`
- `derived_metrics jsonb`
- `created_at`, `updated_at`

Because `user_id` duplicates `attempts.owner_id`, writes must enforce equality. Prefer a database trigger or a single server-side write path; do not trust a client-supplied duplicate identity. `derived_metrics` is for versioned, non-sensitive behavioral measurements only, not transcript or free-form content.

### Supporting records required by the privacy contract

`attempt_metrics` should remain the durable behavioral layer, but the pipeline needs two separate content/state boundaries:

- `quick_read_runs`: one idempotent run per attempt, with status, retry count, provider/model versions, safe error class, request timestamps, `audio_expires_at`, `transcript_expires_at`, and cleanup state. It must never store provider secrets or raw provider payloads.
- `attempt_transcripts`: separate transcript content keyed by `attempt_id`, with `expires_at` and a deletion status. It is deleted after 30 days or account deletion. Narrative feedback should be stored separately from metrics if retained; metrics keep only the structured scores and bounded metadata.

The exact names can change during implementation, but the separation is required: audio and transcript are short-lived content; metrics are durable behavioral metadata.

## Proposed request and idempotency contract

1. Finish the local recording and retain the URI only on-device.
2. User explicitly chooses `Get a Quick Read` and confirms upload/AI processing consent.
3. Establish or require the account/attempt identity before cloud upload; see the open question below.
4. Create or claim one `attempts` row and one `attempt_metrics` row. Capture the server `attempts.id`.
5. Atomically consume one daily quota slot for the attempt. A retry of the same attempt must not consume another slot.
6. Upload to a private Storage bucket at a path scoped to the owner and attempt, such as `{user_id}/{attempt_id}/{run_id}`.
7. Invoke one authenticated Edge Function with `attempt_id` and an idempotency key. The client never receives provider credentials.
8. The function validates ownership, loads the private object, calls the transcription adapter, calls the structured-feedback adapter, persists transcript/result/metrics, and deletes the raw object before returning success.
9. A duplicate request for the same idempotency key returns the existing terminal result or current safe state; it must not duplicate quota consumption, provider work, or metrics rows.

The function should be bounded and synchronous for the MVP so the UX does not depend on a background worker. It must fail with a terminal, recoverable state before the client hangs indefinitely. Supabase documents a 150-second free-plan Edge Function wall-clock limit and a 150-second request idle timeout; paid plans document a 400-second worker limit. This makes elapsed-time budgets and bounded provider calls part of the contract.

## Storage and deletion design

- Use a private bucket with an upload size limit and an allow-list of accepted audio MIME types.
- Scope object paths to the authenticated owner and attempt. Storage RLS must authorize insert/read/delete against `storage.objects.owner_id` and the path; do not use a public bucket.
- Use the Storage API for every object mutation. Supabase documents that deleting a row from `storage.objects` alone does not delete the underlying object and can leave billable inaccessible data.
- On successful analysis, persist the transcript/result/metrics first, then delete audio. If deletion fails, mark cleanup pending and do not report the run as fully complete until an idempotent cleanup retry succeeds.
- For failed runs, set a hard `audio_expires_at` at upload time. A scheduled purge must delete expired objects through the Storage API. Lazy cleanup on the next app open is insufficient for a 24-hour maximum.
- Use Supabase Cron/`pg_cron` plus a narrowly scoped cleanup Edge Function, or an equivalent scheduled operator, for audio and transcript TTLs. The schedule and failure monitoring are part of acceptance.
- Account deletion must explicitly clean Storage objects; `auth.users` cascading database rows does not guarantee Storage object deletion.

## Quota and retry design

- Enforce three reads/day server-side, not in AsyncStorage or client state.
- Define the quota day as UTC unless product explicitly chooses a user timezone.
- Consume quota once when a new run is created; automatic retries and duplicate submissions reuse the same run.
- Use a unique `(user_id, quota_date, attempt_id)` or an equivalent transactional usage record so concurrent requests cannot double-spend a slot.
- Classify provider failures into transient (timeouts, 429, 5xx, transport) and permanent (invalid media, unsupported type, policy rejection, malformed output). Only transient failures receive the two automatic retries.
- After the retry budget is exhausted, show: `Quick Read couldn't finish. Your recording will be deleted automatically.` Keep the local recording available only while the 24-hour retry window remains, and make the purge deadline visible in the state model.

## Feedback and metrics contract

The initial structured result should contain only the locked brief feedback: clarity score, structure score, specificity score, concision score, one strength, one fix, and one next drill. The model output must be schema-validated before persistence. Missing or out-of-range scores are provider failures, not partial success.

Metrics must be versioned independently from prompt/model versions:

- `metric_schema_version`: shape and interpretation of metrics.
- `analysis_prompt_version`: feedback prompt contract.
- `transcription_model_version` and `feedback_model_version`: provider reproducibility.

Do not log transcript text, uploaded audio, model prompts containing transcript content, or raw provider responses. Safe logs may contain attempt/run IDs, status, retry number, bounded error class, byte size, duration, and latency.

## Provider and cost baseline

The current official OpenAI model page lists `gpt-4o-mini-transcribe` at $1.25 per 1M audio input tokens and $5 per 1M audio output tokens. The current official GPT-5 nano page lists $0.05 per 1M text input tokens and $0.40 per 1M text output tokens, and supports Structured Outputs. The exact feedback model snapshot must be pinned in implementation configuration even though the product decision is “nano-class.”

The exact transcription cost per 1,000 analyses cannot be responsibly reduced to minutes without measuring the API's billed audio-token usage for MicDrop's actual 30/60/90-second files. The implementation should record provider usage counters in a non-content cost record or operational log. The cost formula is:

`1000 × (audio_input_tokens × $1.25 / 1,000,000 + audio_output_tokens × $5 / 1,000,000 + feedback_input_tokens × $0.05 / 1,000,000 + feedback_output_tokens × $0.40 / 1,000,000)`

Supabase's current published quotas also matter: Storage includes 1 GB on Free and 100 GB on Pro; Edge Functions include 500,000 invocations on Free and 2 million on Pro before overage. Audio is short-lived, but upload/download egress and function invocations still belong in the cost model.

## Blast radius

Expected implementation surface:

- `src/app/index.tsx`: consent, upload state, result/retry presentation, and local cleanup sequencing.
- New client Quick Read service and typed result/state contracts.
- `src/features/auth/auth-service.ts`: return claimed `attempts.id` and preserve owner-scoped writes.
- New Supabase migrations for `attempt_metrics`, run/transcript/quota records, indexes, triggers, and RLS.
- New private Storage bucket and `storage.objects` policies.
- New Supabase Edge Function(s) for analysis orchestration and scheduled cleanup.
- Supabase secrets/configuration for the OpenAI provider; no secret enters app code or `.env` exposed to Expo.
- Unit, browser, SQL/RLS, deletion/TTL, idempotency, quota-concurrency, and provider-adapter contract tests.

Recording state-machine/audio code should remain unchanged unless a demonstrated upload handoff defect requires a narrow integration change.

## Open questions before implementation

1. **Account boundary:** Must a user be authenticated before the first Quick Read upload? The current `attempts.owner_id` and RLS contract require an authenticated owner, while the desired flow places consent before upload. Recommended: show consent first, then require/complete account setup before upload; never upload an anonymously owned audio object that cannot be durably linked to the attempt.
2. **Exact feedback model ID:** Should the nano-class adapter default to `gpt-5-nano` and pin `gpt-5-nano-2025-08-07`, or use another approved nano snapshot?
3. **Quota timezone:** Is UTC acceptable for the three-per-day boundary, or should the product use the user's local timezone?
4. **Scheduled cleanup authority:** Confirm that Supabase Cron/`pg_cron` and a Vault-held function credential are acceptable for the 24-hour audio and 30-day transcript guarantees.
5. **Narrative feedback retention:** Confirm that the one strength, one fix, and one next drill are retained until account deletion, or should only their structured scores persist?
6. **Upload limits:** Confirm a maximum object size and accepted MIME/container set for 30/60/90-second recordings before Storage policy implementation.

## Discovery conclusion

The correct R0D shape is a consent-gated, authenticated, idempotent Edge Function pipeline with private Storage, scheduled TTL cleanup, server-side quota accounting, and a durable `attempt_metrics` layer separated from transcript/audio content. R0D-B must not begin until the remaining cleanup authority, exact feedback model, quota timezone, narrative-retention, and upload-limit decisions are resolved.

## R0D-A implementation status

The data foundation is now implemented locally in:

- `supabase/migrations/20260813000000_r0d_data_storage_foundation.sql`
- `supabase/tests/r0d_a_data_storage_foundation.sql`
- `supabase/rollback/20260813000000_r0d_data_storage_foundation.sql`
- `scripts/r0d-a-live-acceptance.mjs`

The authenticated claim path now returns the server-created `attempts.id`, which is the required handoff for the later upload boundary. No provider adapter, Edge Function, upload UI, transcript persistence, or Quick Read rendering was added.

The live exit gate is pending because this environment has no Supabase CLI profile (`/Users/thewhitley/.supabase/profile`). Local typecheck, lint, Jest, web export, Node syntax, and diff checks pass; live migration/RLS/Storage/quota execution has not been claimed.
