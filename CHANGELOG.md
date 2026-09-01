# Changelog

## Unreleased

### Changed

- Kept D2-A Core deletion verification and bounded cleanup in the MVP while deferring Cron, Vault, and automated retention operations to the pre-public-launch D2-A Ops gate.
- Accepted R0D-B at baseline `27cb499` after live proof of the private Quick Read vertical slice, ownership boundaries, idempotency, quota enforcement, and retention deadlines.
- Scoped R0D-C to lifecycle hardening and protected test-only provider fault injection; no new product functionality is included.
- Accepted R0D-C after live proof of retry recovery/exhaustion, concurrent idempotency, terminal-state protection, abandoned-run recovery, replayable cleanup, transcript retention, and disposable-account deletion completeness.
