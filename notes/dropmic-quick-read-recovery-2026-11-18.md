# Quick Read schema failure and Take Two recovery

## What changed

- Sanitized production diagnostics tied the second Quick Read failure to `nextDrill / word_limit`; exact provider text was not retained.
- The reconciled server evaluator accepts only rubric judgments/evidence and derives all user-facing coaching deterministically.
- Added a regression test that checks all 16 criterion drills and the all-strength fallback against the 28-word response contract.
- The live project was missing the rubric storage migration and the bounded same-run manual retry migration. The retry guard preserves the existing `uploading → analyzing` path for a persisted transcript, the two-attempt provider budget, ownership, pending audio cleanup, and expiry rules.

## Risks and rollout

- Rubric columns are additive and nullable; existing result rows remain readable through the legacy response envelope.
- One manual retry is possible only on the same failed run while eligible source audio remains. Worst-case provider exposure remains within the existing shared budget of two attempts per stage/run.
- The evaluator permits up to 1,200 more output tokens than the legacy contract. At the current GPT-5 nano output rate, the added-cap ceiling is $0.00048 per analysis, or $0.48 per 1,000 analyses if fully consumed; monthly actual depends on analysis volume and realized tokens. Input tokens remain separately billed.
- No new table, index, storage retention, or infrastructure is introduced. No EAS build or physical-device action is part of this backend rollout.
- Rollback requires restoring a compatible Edge Function first, then a reviewed forward migration to restore the previous transition guard and remove the additive columns/counter. Retained audio is not restored by rollback.

## Validation and follow-up

- App contract and Take Two tests, typecheck, lint, and web export are tracked in the rollout report.
- Run the SQL pgTAP migration suite and Deno function check in a local Supabase environment before claiming those gates passed.
- Verify function version and migration history after deployment; do not trigger a provider request merely to validate rollout. Use the next naturally occurring Quick Read for sanitized success/failure evidence.
