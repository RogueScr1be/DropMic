# R0D-D2A — Core Cleanup Hardening

Status: D2-A Core is locally validated and remains part of the MVP privacy boundary. D2-A Ops is deferred until immediately before external testing. No remote mutation was performed in this stabilization pass.

## Core contract

- `supabase/functions/_shared/storage-deletion.ts` is the shared server-side verifier used by both Quick Read success cleanup and the bounded cleanup function.
- It distinguishes deleted, already absent, partial, ambiguous, and confirmed failure outcomes per requested path.
- It uses the Storage API, checks exact SDK-returned paths, and performs metadata-only absence checks for missing or ambiguous response entries. It never downloads audio or deletes `storage.objects` rows.
- `quick-read` will not mark a run `completed` unless every requested audio path is deleted or confirmed absent. Failed or ambiguous removal stays on the existing recoverable cleanup boundary.
- `quick-read-cleanup` selects at most 50 expired audio runs, 50 expired transcripts, and 50 orphan objects with strict expiry predicates and stable ordering.
- Transcript deletion touches only `analysis_transcripts`; durable results and metrics remain intact.
- `supabase/config.toml` preserves the already-deployed function authentication contract: the platform JWT pre-check is disabled for `quick-read-cleanup`, and the dedicated cleanup header remains the function boundary.

## Deferred D2-A Ops

Automatic 24-hour failed-audio and 30-day transcript enforcement is not active. The following remain a pre-public-launch gate:

- Supabase Cron/`pg_cron` and `pg_net` scheduling;
- Vault provisioning and coordination of the unknown current Edge secret values;
- schedule observability and recurring-execution proof;
- full synthetic live-retention acceptance and zero-residue evidence.

No real-user or paid launch may occur until D2-A Ops, D2-B, and D2-C pass. This work is independent of Premium feature construction.

## Local verification

The deterministic D2-A Core contract suite covers Storage response classification, idempotent absence, partial and ambiguous results, terminal-completion gating, all three 50-row bounds, stable ordering, non-expired protection, retryable deletion failure, repeated cleanup, and concurrent cleanup. Scheduler migration and rollback tests are intentionally removed with the deferred scheduler files.

The local function source and `supabase/config.toml` retain the already-deployed cleanup behavior. Remote migration state, Vault contents, Cron state, current function secret values, and automated retention remain unverified until D2-A Ops is reopened.
