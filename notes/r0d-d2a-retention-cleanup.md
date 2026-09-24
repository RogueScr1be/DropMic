# R0D-D2A — Core Cleanup Hardening

Status: D2-A Core is locally validated and remains part of the MVP privacy boundary. QA8B orphan-audio hygiene is accepted at migration commit `d81c31f`; D2-A Ops remains deferred until immediately before external testing. The accepted live mutation was limited to two verified orphan objects.

## Core contract

- `supabase/functions/_shared/storage-deletion.ts` is the shared server-side verifier used by both Quick Read success cleanup and the bounded cleanup function.
- It distinguishes deleted, already absent, partial, ambiguous, and confirmed failure outcomes per requested path.
- It uses the Storage API, checks exact SDK-returned paths, and performs metadata-only absence checks for missing or ambiguous response entries. It never downloads audio or deletes `storage.objects` rows.
- `quick-read` will not mark a run `completed` unless every requested audio path is deleted or confirmed absent. Failed or ambiguous removal stays on the existing recoverable cleanup boundary.
- `quick-read-cleanup` selects at most 50 expired audio runs, 50 expired transcripts, and 50 orphan objects with strict expiry predicates and stable ordering.
- Transcript deletion touches only `analysis_transcripts`; durable results and metrics remain intact.
- `supabase/config.toml` preserves the already-deployed function authentication contract: the platform JWT pre-check is disabled for `quick-read-cleanup`, and the dedicated cleanup header remains the function boundary.

## QA8B live closeout

Migration `20260920000000_qa8b_orphan_audio_rpc.sql` added the service-role-only orphan enumeration boundary used by the existing version-4 cleanup function. The fresh preflight was `0 / 0 / 0 / 2` for stale runs, expired linked audio, expired transcripts, and orphan audio. One authenticated request returned HTTP 200 and deleted two orphan objects with zero failures and zero ambiguities. The post-cleanup aggregate was `0 / 0 / 0 / 0`; no other cleanup category, provider, quota, Take Two, or repository activity occurred.

`R0D_C_CLEANUP_SECRET` was rotated through macOS Keychain and the Supabase Edge Function secret without recording its value. The cleanup request was a one-time manual acceptance, not proof of automated retention. Deleted Storage objects are not recoverable through rollback; any code or migration reversal requires a reviewed forward migration and compatibility check.

## Deferred D2-A Ops

Automatic 24-hour failed-audio and 30-day transcript enforcement is not active. The following remain a pre-public-launch gate:

- Supabase Cron/`pg_cron` and `pg_net` scheduling;
- Vault provisioning and coordination of the unknown current Edge secret values;
- schedule observability and recurring-execution proof;
- full synthetic live-retention acceptance and zero-residue evidence.

No real-user or paid launch may occur until D2-A Ops, D2-B, and D2-C pass. This work is independent of Premium feature construction.

## Local verification

The deterministic D2-A Core contract suite covers Storage response classification, idempotent absence, partial and ambiguous results, terminal-completion gating, all three 50-row bounds, stable ordering, non-expired protection, retryable deletion failure, repeated cleanup, and concurrent cleanup. Scheduler migration and rollback tests are intentionally removed with the deferred scheduler files.

The local function source and `supabase/config.toml` retain the already-deployed cleanup behavior. The QA8B migration and version-4 function are accepted for the bounded orphan path. Cron/Vault scheduling, recurring execution observability, and automated retention remain deferred until D2-A Ops is reopened.
