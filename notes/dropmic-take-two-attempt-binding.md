# Take Two server attempt binding

## What changed

- Sanitized production logs showed a Quick Read RPC rejected before Edge Function execution: SQLSTATE `23505`, fixed reason `Attempt already has an analysis run`.
- Server attempt IDs are now stored with the local `clientAttemptId` that owns them. The active Quick Read can only receive a matching ID.
- Saved Drop hydration exits when the saved record is not the active take and verifies the request is current before binding state.
- Quick Read opening now fails closed if its completed take does not match the active local identity. Challenge sharing resolves attempts against the Saved Drop's own identity.
- No schema, migration, Edge Function, provider, or production configuration changed.

## Risk and rollback

- Client identity association changed; a mismatch now shows a recoverable preparation message instead of sending an old attempt ID to Supabase.
- No added query, table, index, storage retention, or provider call. Supabase query and storage cost delta: $0; Edge Function runtime unchanged.
- Roll back the client binding change if simulator verification shows a false mismatch, while retaining the server's one-analysis-run-per-attempt guard.

## Follow-up

- Verify a Take Two run receives a distinct attempt identity and Quick Read run, then verify same-take retry still reuses its identity.
- No production mutation, Quick Read provider request, or deployment occurred during diagnosis.
