# MicDrop R0C — Identity and onboarding

R0C adds anonymous Supabase sessions, same-user email OTP conversion, goals/blockers onboarding, sign-out, account deletion, and metadata-only claiming of a completed local attempt.

## Boundaries

- Supabase stores identity, profiles, speaking preferences, and attempt metadata only.
- AsyncStorage stores the unclaimed attempt and pending email for restart/abandonment recovery.
- No local audio URI is sent to Supabase; `audio_retained` is false.
- The client contains only the public URL and anon key. A service-role key is not required.
- The age gate is 13+; no under-13 cloud account path exists.

## Flow

`completion → Get a Quick Read → explanation/13+ gate → email OTP → onboarding → idempotent attempt claim`

The current anonymous user is converted with `updateUser`, not replaced with a second user. Invalid or delayed codes keep the pending email and local attempt. Retry/delete clears the local claim record only after the corresponding local action succeeds.

## Database

`supabase/migrations/20260718000000_r0c_identity_onboarding.sql` creates `profiles`, `speaking_preferences`, and `attempts`, enables owner-only RLS, grants authenticated CRUD only, and adds `delete_my_account()` as the account deletion boundary. `supabase/tests/r0c_identity_onboarding.sql` contains pgTAP contract checks.

## Validation

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test -- --coverage=false`: 7 suites, 28 tests passed.
- `npm run test:browser`: 2 tests passed.
- `npm run web:export`: passed.
- iPhone 16e simulator, iOS 26.2 Release build: passed; interaction/audio not claimed.
- iPad Pro 13-inch (M5) simulator, iOS 26.5 Release build: passed; interaction/audio not claimed.
- `npx supabase test db`: not executed successfully because Docker/Postgres was unavailable.
- Supabase environment variables were absent, so live Auth/OTP/RLS/deletion behavior remains unverified.

## R0C.1 live security acceptance attempt

The expected commit was confirmed and the worktree was clean. No disposable Supabase project credentials or CLI access token were configured, and Docker was unavailable. Therefore no anonymous UUID, post-conversion UUID, table counts, HTTP status codes, cross-user denial, or deletion evidence was collected.

Static review confirmed the intended source contract: `delete_my_account()` uses `auth.uid()` with `search_path = ''`; public execution is revoked and only `authenticated` is granted execute; all three tables use owner-scoped policies; and the client has no service-role/admin reference. These observations do not substitute for live API evidence.

## R0C.2 activation attempt

The supplied public configuration was placed in ignored `.env.local` for project `bxoqbbzabubvdbxqquyt`. The live Auth settings endpoint returned HTTP 200 with anonymous sign-ins and email authentication enabled. A disposable anonymous session was created successfully; captured UUID: `be27c854-f48a-4ed3-bda9-bb806c8e4916`.

The CLI could not authenticate, so the migration was not pushed. No OTP conversion, UUID equality, attempt claim, live RLS, REST ownership, redirect, or deletion evidence was collected. The captured UUID is development evidence only and is not used by the app or stored in Postgres.

`auth.updateUser({ email })` accepted a second disposable mailbox, but no OTP arrived within a 90-second `mail.tm` poll. This verifies request acceptance only, not email delivery or identity conversion. The first disposable provider returned HTTP 403. No application workaround was added.

## R0C.2 linked-project acceptance

The authenticated CLI confirmed project `bxoqbbzabubvdbxqquyt` as `MicDrop`, `ACTIVE_HEALTHY`, linked, and in `us-west-2`. This differs from the requested North Virginia region and is recorded as an operator configuration discrepancy; no move was attempted.

Migration history and objects were verified remotely:

- `20260718000000`, `20260720100000`, and `20260720110000` appear in local and remote migration history.
- `profiles`, `speaking_preferences`, `attempts`, and `delete_my_account()` exist.
- RLS is enabled on all three tables; 12 owner policies are present.
- Anonymous table privileges are false; authenticated CRUD privileges are true.
- Deletion RPC is security-definer with `search_path = ""`; anon/public execute is false and authenticated execute is true.

The live two-user harness is [r0c2-live-acceptance.mjs](/Users/thewhitley/MicDrop/scripts/r0c2-live-acceptance.mjs). It produced:

- Owner CRUD: profiles, preferences, and attempts passed; `audio_retained` remained false.
- Attempt claims: first, retry, and both concurrent claims returned no error; exactly one row remained.
- Cross-user client reads returned zero rows for all tables; mutations were no-ops; ownership substitution returned `42501`.
- Direct REST reads returned `200` with zero rows; direct REST inserts returned `403` with `42501` for all tables.
- Deletion returned no error; old-session `getUser` returned `403`; repeated deletion returned `P0001 Authenticated user not found`.
- Post-deletion counts for profiles, preferences, attempts, and auth identity were all zero.

OTP request and resend returned no client error; invalid and duplicate verification returned `403 Token has expired or is invalid`. No OTP arrived through the disposable mailbox within 90 seconds, so UUID equality after verification, redirect behavior, and expired-token delivery remain unverified.

## Cost shape

At the current Supabase pricing baseline, the Free plan includes 50,000 MAU and the Pro plan starts at $25/month with 100,000 MAU included; above that, Auth MAU is $0.00325 per MAU. This metadata-only phase adds negligible database volume and no Storage/egress usage. Approximate project baseline: 1,000 users $0 Free / $25 Pro; 10,000 $0 / $25; 100,000 $0 / $25; these figures exclude email provider charges, compute beyond included credits, and any future upload/transcription costs.

## R0C.3 final OTP acceptance — ACCEPTED

Commit `a35238b` is the functional-completion baseline. The final proof used one fresh
owner-controlled address, `prentiss+micdrop-r0c-proof-20260813@soslactation.com`, without
resetting or deleting the existing owner account. The anonymous UUID was recorded before
requesting the OTP and compared internally with the post-verification UUID.

Sanitized identity evidence:

- Anonymous UUID: `637d…2bbb`
- Authenticated UUID: `637d…2bbb`
- Equality: PASS
- Attempt owner: `637d…2bbb`
- Owner equality: PASS
- `is_anonymous`: `false`
- `auth.users` rows for the proof address: `1` (Supabase Auth user-list search)
- Email verification: confirmed

The controlled attempt was created before conversion with the anonymous UUID as `owner_id`.
After `verifyOtp({ type: 'email_change' })`, the same UUID remained authenticated and owned
the attempt. The earlier browser acceptance also confirmed that authenticated recovery did
not reopen OTP after reload and restored the completed local take. The stale-email/session
precedence regression is covered by unit tests.

The callback correction is complete: Supabase uses MicDrop's actual dev port `8082`, and
`/auth/callback` is a registered terminal route. The remaining physical-iPhone audio blocker
is unrelated to R0C identity and remains pre-TestFlight work.

Validation after the controlled proof:

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test -- --coverage=false`: 8 suites, 40 tests passed.
- `npm run test:browser`: 5 tests passed.
- `npm run web:export`: passed; `/auth/callback` exported.
- `node scripts/r0c2-live-acceptance.mjs`: passed; owner CRUD, idempotent claims, RLS, and deletion checks passed.
- `git diff --check`: passed.
- `npx supabase test db`: not run because Docker/Postgres is unavailable.

R0C is accepted and R0D is unblocked. No R0D work was started in this pass.
