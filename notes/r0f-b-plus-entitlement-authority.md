# R0F-B — Plus Entitlement Authority

Status: implemented foundation only. No paid access is live.

## Decision

RevenueCat is the selected iOS-first provider, but it is not installed or
store-wired in R0F-B. The future purchase integration must sit behind a narrow
adapter that maps provider events into the server-owned entitlement state. The
adapter exit boundary is the provider-specific purchase, restore, and webhook
translation layer; Premium feature authorization must consume the server
resolver and must not depend on RevenueCat client state.

R0F-B adds one current-state table, `public.billing_entitlements`, keyed by the
stable Supabase `auth.users.id` and the `plus` entitlement key. It contains no
webhook event ledger. That ledger is deferred until webhook implementation has
a real consumer and an idempotency requirement to satisfy.

Anonymous accounts cannot purchase. The existing stable Supabase UUID remains
the only future purchase identity, including after anonymous-to-email
conversion. The resolver accepts a server-selected row and no client-supplied
owner id; its missing, malformed, expired, revoked, and grace-boundary paths
fail closed.

## Scope and validation boundary

This phase changes no client UI, Quick Read quota, account deletion behavior,
provider SDK, purchase flow, webhook, store configuration, Edge Function, or
remote resource. No paid capability is authorized by this table yet. Free
Quick Read remains the active product loop.

Free Gate B remains required before exposing a paywall. The next product phase
is the server-gated Take Two capability; RevenueCat purchase plumbing follows
only after Premium value exists and the Free foundation is launch-ready.

## Cost, blast radius, and rollback

The local migration and resolver have no incremental provider or runtime cost.
RevenueCat cost begins only when the provider adapter is later installed and
configured; the accepted planning assumption is free through $2,500 monthly
tracked revenue, then 1%.

The blast radius is limited to the new table and its authenticated read policy;
no existing table, function, or client path reads it. The matching rollback
drops the `billing_entitlements_set_updated_at` trigger and
`public.billing_entitlements`. It must be run only before a later phase adds
dependencies to this table.

## Remaining blockers

- Free Gate B is not yet accepted.
- Take Two server authorization and its tests are not implemented.
- RevenueCat adapter, iOS product configuration, purchases, restore, webhook
  HMAC verification, event idempotency, refund/expiration synchronization, and
  paywall UI remain deferred.
- Account deletion must later define provider identity cleanup and entitlement
  synchronization before paid launch.
