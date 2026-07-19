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

## Cost shape

At the current Supabase pricing baseline, the Free plan includes 50,000 MAU and the Pro plan starts at $25/month with 100,000 MAU included; above that, Auth MAU is $0.00325 per MAU. This metadata-only phase adds negligible database volume and no Storage/egress usage. Approximate project baseline: 1,000 users $0 Free / $25 Pro; 10,000 $0 / $25; 100,000 $0 / $25; these figures exclude email provider charges, compute beyond included credits, and any future upload/transcription costs.
