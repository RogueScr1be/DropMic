# DropMic Launch Configuration Manifest

This document is source-controlled and contains names, boundaries, and verification steps only. It intentionally contains no secrets, tokens, customer identifiers, or production credentials.

## Supabase

- Repository project identifier: MicDrop in supabase/config.toml.
- Cloud project reference: supply through SUPABASE_PROJECT_REF; confirm the deployed value before applying anything.
- Pending migration: supabase/migrations/20260924000000_launch_challenges_and_analytics.sql.
- Functions to deploy:
  - create-challenge with JWT verification enabled.
  - resolve-challenge with JWT verification disabled because it is the public landing-page resolver.
- Required Edge Function environment names: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
- create-challenge requires a permanent authenticated user and an owned attempts.id; it stores only a SHA-256 token hash.
- resolve-challenge performs token-hash lookup through the service-role boundary and returns only the public challenge contract.
- Existing Quick Read v16, Quick Read Cleanup v4, Take Two v1, quota, transcript, provider, and account-deletion functions remain unchanged.
- Read-only post-deployment checks:
  - Confirm both function JWT settings.
  - Resolve one valid challenge through resolve-challenge.
  - Verify malformed, expired, disabled, and unknown tokens return safe errors.
  - Verify anonymous/authenticated clients cannot select challenge_links or analytics_events.
  - Run supabase test db with Docker available.

## RevenueCat

- Project/app: create or select the DropMic iOS app in the owner’s RevenueCat project.
- Public SDK key variable: EXPO_PUBLIC_REVENUECAT_IOS_TEST_STORE_KEY.
- Entitlement identifier: plus.
- Offering identifier: the current offering configured in RevenueCat.
- Package mapping:
  - Monthly: RevenueCat monthly package identifier.
  - Annual: RevenueCat annual package identifier.
  - Lifetime: RevenueCat lifetime package identifier.
- Product identifiers are intentionally not hard-coded in the app; they are read from the trusted RevenueCat offering.
- Customer Center must be enabled for the iOS app.
- RevenueCat webhook/reconciliation must write the existing billing_entitlements authority table with entitlement_key = plus.
- Sandbox checks: purchase, cancellation, failed purchase, restore, expiration/revocation, restart, and account-switch identity binding.

## App Store Connect

- Bundle ID: com.prentisswhitley.dropmic.
- Subscription group: assign the owner-selected DropMic Plus group.
- Products: monthly subscription, annual subscription, lifetime non-consumable.
- Price tiers: owner-selected; the UI does not invent prices when RevenueCat is unavailable.
- Localizations: product names, descriptions, subscription renewal copy, screenshots, and review notes.
- Review requirements: explain microphone permission, free 30-second challenge, Restore Purchases, and Plus-gated 60/90-second access.
- Terms URL: EXPO_PUBLIC_DROPMIC_TERMS_URL.
- Privacy URL: EXPO_PUBLIC_DROPMIC_PRIVACY_URL.
- App Store URL: leave unset until App Store Connect assigns it.
- Current iOS build number: 1; current Android version code: 1.

## Web and challenge URLs

- Production hostname variable: EXPO_PUBLIC_DROPMIC_WEB_ORIGIN.
- Required route: /challenge/[token].
- HTTPS is required for the production web origin.
- Configure Universal Links/App Links only if the owner elects to support installed-app handoff; no temporary hostname is assumed here.
- Add the final App Store URL to the web fallback once assigned.
- The first external owner decision is the production hostname. Do not replace it with a guessed domain.

## Authentication

- Supabase URL variable: EXPO_PUBLIC_SUPABASE_URL.
- Supabase public client key variable: EXPO_PUBLIC_SUPABASE_ANON_KEY.
- SMTP status: verify sender/domain, delivery, rate limits, and OTP template before launch.
- OTP template subject: owner-selected production subject.
- Redirect URLs: configure the final HTTPS web origin and the micdrop://auth/callback app scheme.
- Run one controlled production OTP test only after the sender/domain and redirect allowlist are confirmed.

## Release verification boundary

No migration, Edge Function, RevenueCat setting, App Store Connect record, web deployment, SMTP setting, or TestFlight artifact is changed by this repository checkpoint.
