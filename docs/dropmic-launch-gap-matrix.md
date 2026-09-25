# DropMic Launch MVP gap matrix

Initial inventory from `main` at `493d2287c73246b22d638beddcd4b083dd6848a0`.

| Requirement | Evidence | Status | Launch action |
| --- | --- | --- | --- |
| Local recording state machine and 30/60/90 selection | `src/features/recording/recording-machine.ts`, `src/ui/DurationPicker.tsx` | Present but incomplete | Gate 60/90 through verified Plus entitlement. |
| Anonymous first Drop and account conversion | `src/features/auth/auth-recovery.ts`, `src/features/auth/SignupFlow.tsx`, `src/app/index.tsx` | Present and accepted | Preserve; add launch analytics. |
| Quick Read with three/day server quota | `src/features/quick-read/quick-read-service.ts`, `supabase/functions/quick-read/index.ts` | Present and accepted | Preserve quota/provider/cleanup contracts. |
| Free/Plus score presentation | `src/features/quick-read/QuickReadFlow.tsx`, `src/features/billing/plus-display.ts` | Present but incomplete | Add purchase/restore paywall boundary and keep server authority. |
| Mic Flow | `src/features/mic-flow/*`, `supabase/migrations/*mic_flow*` | Present and accepted | Preserve; expose existing Plus statistics only when authorized. |
| Saved Drop library | `src/features/recording/local-completed-take.ts` | Present but incomplete | Add versioned newest-first local library with free cap and migration. |
| Share card | No share-card or native-share module found | Missing | Add privacy-safe share payload/card component with text fallback. |
| Challenge links | No challenge schema, route, or Edge Function found | Missing | Add additive schema, create/resolve functions, deep-link route, and expiration tests. |
| RevenueCat identity | `src/features/billing/revenuecat-adapter.ts`, `revenuecat-session.ts` | Present but incomplete | Add offering, purchase, restore, and customer-center boundaries. Product identifiers remain configuration-owned. |
| Minimal analytics | No application event module/table found | Missing | Add deduplicated privacy-safe event contract and migration. |
| Account deletion | `src/features/auth/auth-service.ts`, deletion migrations | Present and accepted | Preserve and keep reachable from settings. |
| Development-login release guard | `isDevTestLoginEnabled()` in `auth-service.ts`, guarded UI in `SignupFlow.tsx` | Present and accepted | Add static release guard tests; do not embed credentials. |
| Privacy/Terms and App Store metadata | `app.json`; no production URLs or build number found | Blocked by external configuration | Owner must supply approved URLs, App Store metadata, RevenueCat products, and release credentials. |
| Supabase production Auth/SMTP | Existing recovery flow; repository does not contain credential values | Blocked by external configuration | Verify sender/domain, template, redirects, and one controlled OTP acceptance. |
| Public feed, leaderboard, topic packs, rooms, memory, advanced editing | No launch evidence; explicitly excluded | Deferred by scope | Do not build. |
