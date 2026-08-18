# R0E — DropMic Monetization and Launch Contract

Status: documentation-only decision gate. R0F Purchase Foundation is not authorized.

R0D-C remains accepted as a live-harness-proven backend lifecycle milestone. It did not prove automatic production retention scheduling, synchronous Storage deletion during account deletion, or client attempt/idempotency reset across successive recordings. Those findings do not reopen or redesign the accepted provider pipeline.

## Product identity

Customer-facing name: **DropMic**

Positioning: **Think fast. Speak clearly.**

Core loop:

`CLACK → PROMPT → SPEAK → ONE USEFUL CORRECTION → TAKE TWO`

Primary metric: **feedback-to-second-take rate**.

Primary value proof: **whether the targeted behavior improves on Take Two**.

DropMic must not introduce generic confidence scoring, emotion detection, personality inference, accent scoring, or psychological assessment.

## DropMic Free

- 30/60/90-second practice
- Cold Take
- Daily Prompt
- Freestyle/no-script
- Interview Basics
- Student Basics
- Unrestricted retries
- Solari experience
- Mic Flow and Best Mic Flow
- Basic seven-day history
- Reasonable free Mic Save cadence
- Challenge links and share cards
- Three Quick Reads per day
- Recent derived attempt history
- No onboarding paywall
- No forced subscription trial
- Raw audio remains transient

## DropMic Plus

Products:

- Monthly: `$4.99`
- Annual: `$29.99`
- Annual introductory first year: `$19.99`

Plus includes Deep Read, Take Two comparison, persistent derived improvement signals, Personalized Next Drill, Custom Prompt, long-term history, advanced Mic Flow history, additional Mic Saves/bookmarks, and advanced rubrics for separately owned Packs.

Plus also includes one free Deep Read demonstration after the fifth completed rep and a maximum of five Deep Reads per UTC day. Plus does not include every future Skill Pack. There is no Lifetime product at launch.

## Skill Packs

Launch candidates:

- Interview Pro — `$4.99`
- Founder Pitch — `$4.99`

Packs are permanent purchases separate from Plus.

- A Pack never grants Plus.
- Plus never grants ownership of a paid Pack.
- A non-Plus Pack owner receives its prompts, drills, progression, terminology, Pressure Test, and ordinary Quick Read.
- A Plus subscriber who owns the Pack additionally receives its advanced rubric, Deep Read, Take Two comparison, and persistent progress.
- No pack credits, analysis credits, coins, or virtual currency.

Each launch Pack must contain 40–60 curated prompts, five to eight categories, five targeted drills, difficulty progression, Pack terminology, three challenge-ready prompts, Pack-specific Quick Read guidance, a versioned advanced rubric, and one Pressure Test.

## Intended identifiers

These are documented as intended only; none are implemented:

- `dropmic_plus_monthly`
- `dropmic_plus_annual`
- `dropmic_pack_interview_pro`
- `dropmic_pack_founder_pitch`

Entitlements:

- `plus`
- `pack.interview_pro`
- `pack.founder_pitch`

## Identity and server authority

The stable Supabase `auth.users.id`/owner UUID is the only future purchase identity and will become the RevenueCat App User ID. Anonymous-to-email conversion must not create another purchase identity. No parallel customer-account system is permitted.

Before implementation, account deletion must define treatment of RevenueCat identity, server mirrors, durable metrics, transcripts, audio, and Storage objects.

The client may display cached entitlement state but is never authoritative for provider access. The server must resolve current Plus status, owned Pack IDs, Quick Read quota, Deep Read quota, rubric access, and refund, revocation, expiration, and billing state. A modified client must not bypass paid gates.

## Privacy and retention

- Successful analyzed audio remains transient.
- Failed audio retains the existing 24-hour maximum boundary.
- Transcripts retain the existing 30-day maximum boundary.
- Persistent paid value stores derived metrics and coaching signals.
- Plus must not silently extend raw-audio retention.
- A future `KEEP THIS TAKE` feature requires explicit consent, individual deletion, storage management, and complete account-deletion behavior.
- `KEEP THIS TAKE` is deferred.

## Explicitly deferred

Public feed/community, Rooms, public audio library, video, real-time AI interruption, open-ended coach chat, classroom/team administration, enterprise tooling, Android, web app, leaderboards, comments, likes, followers, emotion/personality/accent/confidence inference, Lifetime AI, and additional paid Packs beyond Interview Pro and Founder Pitch.

## Sequencing gates

R0F Purchase Foundation is not authorized.

### Gate A — Core lifecycle production repair

Repair the existing R0D boundary without redesigning it:

- reset `serverAttemptId` for every new recording;
- generate a fresh Quick Read idempotency key for every distinct take;
- configure and prove automatic audio/transcript cleanup scheduling;
- explicitly remove user Storage objects during account deletion;
- verify object absence rather than treating a non-error response as proof;
- bound retry/timeout behavior below the Edge Function wall-clock limit.

### Gate B — Minimum Free product foundation

Establish the smallest launchable Free loop:

- named Cold Take mode;
- Freestyle;
- minimum Interview Basics and Student Basics content;
- Mic Flow;
- basic recent history;
- feedback-to-retry path;
- focused analytics for the core speaking loop.

Challenges, richer history, Mic Saves, and expanded content require separate prioritization after repository discovery. They must not be bundled automatically into one phase.

## Acceptance criteria for R0E

- This file is the single complete monetization contract.
- Feature ownership has zero ambiguity.
- Free, Plus, and Packs remain economically distinct.
- Identity, entitlement, quota, refund, and retention semantics are explicit.
- The revised sequencing is recorded in the decision and engineering logs.
- No runtime files, schemas, dependencies, native configuration, or remote resources change.
- R0F remains blocked until Gates A and B are accepted.
