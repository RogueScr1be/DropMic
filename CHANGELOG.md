# Changelog

## Unreleased

### Changed

- Added the iOS-only R0F-F1 RevenueCat Test Store identity foundation using
  the permanent Supabase UUID; purchases and paid access remain deferred.
- Added the R0F-B server-authoritative Plus entitlement foundation without a
  purchase SDK, paywall, webhook ledger, or live paid access.
- Added the local-only, read-only R0F-C Take Two server capability; deployment
  and live authorization remain deferred to the combined gate.
- Added the local-only R0F-D Take Two client journey with Plus-only display
  eligibility, locked same-prompt retakes, and raw comparison rendering.
- Kept D2-A Core deletion verification and bounded cleanup in the MVP while deferring Cron, Vault, and automated retention operations to the pre-public-launch D2-A Ops gate.
- Accepted R0D-B at baseline `27cb499` after live proof of the private Quick Read vertical slice, ownership boundaries, idempotency, quota enforcement, and retention deadlines.
- Scoped R0D-C to lifecycle hardening and protected test-only provider fault injection; no new product functionality is included.
- Accepted R0D-C after live proof of retry recovery/exhaustion, concurrent idempotency, terminal-state protection, abandoned-run recovery, replayable cleanup, transcript retention, and disposable-account deletion completeness.
