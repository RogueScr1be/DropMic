# R0F-D — Local Take Two Client Journey

Status: local-only client experience. No purchases, paywall, RevenueCat
integration, schema, quota change, deployment, or remote mutation is included.

## User flow

After a completed Quick Read, the client performs an owner-scoped,
display-only Plus entitlement read. Only active/unexpired or valid-grace state
reveals the Take Two invitation. Free, anonymous, malformed, expired, revoked,
loading-failure, and unavailable states show no CTA.

The Plus user taps Take Two, which preserves the first server run ID and returns
to the existing recorder with the exact topic and duration locked. A fresh
client attempt and Quick Read idempotency identity are created. The second
recording uses the normal claim, upload, analysis, and daily-quota path.

After the second Quick Read completes, the client sends only the two run IDs to
`take-two`. The server remains the final entitlement and ownership authority.
The result shows the original prompt, First Take, Second Take, and raw
follow-up-minus-baseline score and supporting-metric deltas. No directionality
or “better/worse” interpretation is added.

`Done` returns to the normal home completion flow. The journey does not support
Take Three, arbitrary history selection, comparison persistence, or sharing.

## Safety and accessibility

Duplicate Quick Read and comparison requests are blocked. Take identity
changes invalidate stale responses, component cleanup cancels state updates,
and the completed second Quick Read is preserved when comparison is denied,
malformed, unavailable, or affected by network/session failure. No token,
identity, run ID, prompt, audio path, transcript, or result is logged.

Actions use labeled 44pt-plus touch targets, semantic button/radio roles,
live-region status copy, and a deterministic reading order. The existing
platform-native modal and back behavior remain unchanged for iOS, Android, and
web.

## Cost, blast radius, and deferred validation

The client adds no provider or AI calls. The second Quick Read intentionally
consumes one normal quota unit and has the same existing provider cost as any
other Quick Read. The comparison adds one authenticated Edge Function request
and bounded durable-data reads.

The local blast radius is limited to the home/Quick Read journey, the
display-only entitlement query, and the comparison client adapter. Native
development-build behavior, live entitlement/RLS authorization, deployment,
session expiry, quota exhaustion, and full two-take acceptance remain in the
combined credential-backed gate. RevenueCat, purchase, restore, paywall, and
store work remain deferred.
