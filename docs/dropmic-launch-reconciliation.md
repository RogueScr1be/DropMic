# DMVP-LAUNCH-R1 Reconciliation Matrix

Baseline: main at 493d2287c73246b22d638beddcd4b083dd6848a0, with the unstaged Launch MVP implementation.

The source and Jest evidence below are local. Supabase pgTAP and Edge runtime execution were not available because Docker, Supabase CLI, and Deno are not installed in this environment. Physical-device and Playwright acceptance remain external gates.

| Claim | Source evidence | Test/evidence | Status | Required correction |
| --- | --- | --- | --- | --- |
| Saved Drops migrate safely, enforce three Free, preserve Plus/downgrade data, verify files, delete one item, and isolate owners | saved-drops.ts validates records, checks local files, scopes updates/deletes by owner, and migrates the legacy key | saved-drops.test.ts; full Jest | PASS | None |
| TakeIdentity and completion-bell deduplication remain intact | Existing attempt-identity and completion-sound paths were not changed | Existing full Jest suites | PASS | None |
| Challenge tokens are strong and only hashes persist | create-challenge uses 32 random bytes; migration stores token_hash only | Static Edge review; challenge contract tests | PASS | Edge runtime proof after deploy |
| Challenge creation verifies permanent auth, owned attempt, source-owner trigger, and bounded rate | create-challenge checks permanent user, owned attempts.id, and five-per-minute owner count; SQL trigger fixes search_path | Static review; pgTAP coverage authored | PARTIAL | Run pgTAP and Edge integration after Docker/Supabase access |
| Challenge resolution is public but exposes only approved fields and fails safely for malformed/expired/disabled links | resolve-challenge validates a 64-hex token and uses toPublicChallenge | challenge-contract.test.ts; static Edge review | PARTIAL | Run deployed resolver checks |
| Raw challenge tokens/private identifiers stay out of analytics and share text | analytics rejects UUID/token/private dedupe keys; share contract allowlists public text | analytics/share/challenge tests; source scan | PASS | None |
| Challenge acceptance creates a fresh identity, preserves 30/60/90 duration, and does not auto-record | accepted route resolves prompt only; index starts a new TakeIdentity and selects resolved duration | Source audit; full Jest | PARTIAL | Add device-level acceptance coverage |
| Challenge RLS, grants, owner isolation, expiry/disabled columns, and no direct enumeration are defined | additive migration, owner policies, service-role grants, fixed trigger, expanded pgTAP file | Static SQL review; Docker unavailable | PARTIAL | Run pgTAP locally/CI |
| Share cards work with/without Quick Read and do not invent scores or vibe | ShareCard and share-service use optional fields and a safe text/link payload; share taps are guarded | share-service.test.ts; full Jest | PASS | Native cancellation/device check remains |
| Share cancellation/failure is isolated from product flows | shareDropCard awaits best-effort analytics and native Share cancellation resolves normally | source audit; analytics failure test | PASS | Device share-sheet check remains |
| Plus uses the authoritative plus entitlement and fails closed on unavailable/offline/revoked state | plus-display and existing entitlement resolver remain authoritative; paywall consumes trusted offerings | billing/entitlement/adapter suites | PASS | RevenueCat sandbox and webhook verification remain |
| Monthly, annual, lifetime products are configuration-driven | fallback rows have no identifiers; actual package identifiers come from RevenueCat offerings | typecheck; adapter tests; configuration manifest | PASS | Configure real offerings externally |
| Purchase success, cancellation, failure, restore, and Customer Center states are distinct | adapter classifies cancellation separately and paywall renders safe messages | adapter tests; source audit | PASS | RevenueCat sandbox check remains |
| Plus unlocks 60/90 seconds, unlimited Saved Drops, Structure, and Directness; Free remains constrained | DurationPicker, Saved Drops cap, and QuickRead score lock paths | full Jest; source audit | PASS | None |
| Analytics names, deduplication, bounded ledger, privacy filter, and failure isolation are correct | analytics allowlist, 500-event ledger, safe dedupe keys, best-effort transport | analytics.test.ts; full Jest | PASS | None |
| Release login is development-only and no test credentials are embedded | auth checks __DEV__ plus explicit flag; no credential literal | release-login-guard.test.ts; Expo config | PASS | None |
| Release config/build/audio/challenge boundary is present | Expo SDK 57 config, iOS build 1, Android version 1, scheme, microphone permission, static challenge route | web export; Expo config; iOS Release simulator build | PASS | Physical device/TestFlight remains |
| Legal URLs, production hostname, RevenueCat, Supabase, SMTP, and App Store metadata are ready | Secret-free manifest records exact required names and owner checkpoints | docs/dropmic-launch-configuration.md | PARTIAL | Owner must configure external systems |

## R1 conclusion

No additional product features were added. Proven local defects were repaired. The codebase is ready for deployment authorization, subject to the external configuration and runtime checks explicitly listed above.
