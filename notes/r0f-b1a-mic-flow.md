# R0F-B1A — Server-authoritative Mic Flow foundation

## Status

Local implementation only. No deployment or remote mutation was performed in
this phase.

## Contract

Mic Flow qualifies a completed local speaking take only after an authenticated
Supabase RPC accepts it. The app attempts to establish an anonymous Supabase
session before recording, but local recording continues when that attempt or
connectivity fails. An unowned or offline completion receives no Flow credit;
there is no offline mutation queue and no retroactive credit.

The current unnamed first-use prompt is represented as `cold_take` for the
foundation. Freestyle, Interview Basics, Student Basics, and future challenge
responses are server-supported mode values; their UI and content remain
deferred.

## Data and authority

`public.mic_flow_completions` is the immutable, metadata-only qualifying source.
It is keyed by the stable local completion identity and permits one accepted
qualifying completion per owner and local calendar day. It stores no audio or
transcript. `public.mic_flow_state` stores server-calculated current Flow, best
Flow, Save balance, and rewarded seven-day milestone.

`public.record_mic_flow_completion(...)` derives ownership from `auth.uid()`,
uses database server time rather than a client timestamp, validates mode,
duration, and IANA timezone, derives the local day server-side, serializes
owner transitions, deduplicates replay and same-day completion, and ignores
out-of-order days. Its discriminated response is `credited`,
`already_credited`, `same_day`, `save_decision_required`, or `unavailable`.
`p_use_save` is tri-state: `null` pauses exactly one missed-day decision,
`true` protects it, and `false` resets without consuming a Save. There is no
automatic Save consumption. A timezone change can advance only when the
server completion timestamp is later in both the stored old timezone and the
new timezone; otherwise it is same-day. Plus capacity and milestone rewards
are resolved from the existing server-owned `billing_entitlements` row; the
client cannot supply Plus or state totals.

The app captures the trusted session UUID and bearer token at recording start
in ephemeral memory. It submits the captured token and rechecks the current
session after the RPC; sign-out or account switching invalidates the pending
identity. A missing or stale identity leaves the local recording usable but
uncredited, with no offline queue or retroactive credit.

Retrying the RPC for the same completed take reuses its completion identity.
Retrying the recording itself still follows R0D-D1 and creates a new take
identity. Anonymous-to-email conversion preserves the Supabase UUID, so the
Flow rows remain attached to the same owner. Auth deletion cascades the new
metadata rows.

## Deferred gates

No Flow dashboard, mode/content UI, sharing, leaderboard, XP, badges, offline
sync, analytics SDK, purchase flow, RevenueCat reconciliation, Packs, cron, or
remote acceptance is included. The remaining gate is database execution and
live acceptance with synthetic identities, including concurrency, timezone
changes, deletion, and zero residue.
