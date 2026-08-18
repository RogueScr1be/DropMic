# R0D-D1 — Attempt Identity Isolation

Status: client-only lifecycle-repair gate. No backend, schema, dependency, native configuration, analytics, monetization, or remote-resource changes.

## Root cause

The completed recording screen retained `serverAttemptId` after retry/delete, while `QuickReadFlow` retained one idempotency key for its component lifetime. The flow remains mounted between recordings, so a later take could reuse the prior server attempt, idempotency key, result, or in-flight request state.

## Contract

- One completed local recording asset is one take.
- The parent owns one local take identity and one Quick Read idempotency key for that take.
- The server attempt ID is scoped to that take and is cleared before a new take begins.
- Duplicate submission, network replay, same-recording Quick Read retry, and same-recording auth conversion retain the take identities.
- Record Again, retrying the recording, deleting the completed recording, or replacing its audio rotates the local take identity and idempotency key, clears the server attempt ID, closes Quick Read, and prevents the previous result from displaying.
- Late results and errors are applied only when both the take identity and request generation are still current. The client does not cancel backend work.

## Implementation boundary

`src/app/index.tsx` now creates and rotates the local take identity at the existing retry/delete boundaries, clears the cached server attempt, and rejects stale asynchronous Quick Read opening work. `QuickReadFlow` receives the take ID and idempotency key explicitly, suppresses duplicate in-flight taps, resets its visible state for a new take, and guards late result/error application. The existing Quick Read service and server contract are unchanged.

## Verification

The deterministic local identity suite covers same-take reuse, duplicate taps, recording-again rotation, server-attempt rotation, idempotency-key rotation, delete-to-new-recording isolation, same-recording retry, auth conversion, stale Take A result/error rejection, and stale-result display clearing. No live provider or Supabase harness is required for this client gate.
