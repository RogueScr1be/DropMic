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

## Cost shape

At the current Supabase pricing baseline, the Free plan includes 50,000 MAU and the Pro plan starts at $25/month with 100,000 MAU included; above that, Auth MAU is $0.00325 per MAU. This metadata-only phase adds negligible database volume and no Storage/egress usage. Approximate project baseline: 1,000 users $0 Free / $25 Pro; 10,000 $0 / $25; 100,000 $0 / $25; these figures exclude email provider charges, compute beyond included credits, and any future upload/transcription costs.
