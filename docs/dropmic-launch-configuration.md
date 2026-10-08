# DropMic Launch Configuration Manifest

This document is source-controlled and contains names, boundaries, and verification steps only. It intentionally contains no secrets, tokens, customer identifiers, or production credentials.

## Supabase

- Repository project identifier: MicDrop in supabase/config.toml.
- Cloud project reference: `bxoqbbzabubvdbxqquyt` (active/healthy).
- Challenge attribution, link rotation, RevenueCat entitlement sync, and Skill Pack entitlement migrations are applied.
- Active functions include `create-challenge` (JWT required), `resolve-challenge` (public resolver), `revenuecat-sync` (JWT required), `revenuecat-webhook` (webhook authorization), and `skill-pack-content` (JWT required plus owner check).
- Required Edge Function environment names: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
- create-challenge requires a permanent authenticated user and an owned attempts.id; it stores only a SHA-256 token hash.
- resolve-challenge performs token-hash lookup through the service-role boundary and returns only the public challenge contract.
- `skill-pack-content` returns server-owned prompts only after authenticated ownership verification; Plus-only rubric data is separately gated.
- Remaining verification: sandbox purchase/restore, refund/expiration behavior, owner switching, and Pack-versus-Plus isolation.

## RevenueCat

- Project/app: DropMic project `3d81e688`, TheDropMic app `appe887860c65`.
- iOS SDK key variable: `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` (production EAS variable).
- Plus entitlement: `plus`; current offering `default` has Monthly and Annual only.
- Pack entitlements: `pack.interview_pro`, `pack.founder_pitch`.
- Pack offering: `skill_packs` has custom Interview Pro and Founder Pitch packages mapped to their matching RevenueCat product records; the App Store products still need to be created.
- Pack product/package pairs: `dropmic_pack_interview_pro` / `pack_interview_pro` and `dropmic_pack_founder_pitch` / `pack_founder_pitch`.
- Approved plan: $4.99 monthly, $29.99 annual with an eligible $19.99 first year; Packs are separate $4.99 permanent non-consumables; no Lifetime plan.
- RevenueCat webhook/sync and owner-verified Pack content functions are deployed. No production purchase has been made.

## App Store Connect

- Bundle ID: com.prentisswhitley.dropmic.
- App Store Connect sign-in is required to finish product records and listing metadata.
- Products: monthly/annual subscriptions plus Interview Pro and Founder Pitch non-consumable products; Lifetime is excluded from the offer.
- Prices: $4.99/month, $29.99/year, eligible annual intro $19.99 for first year, each Pack $4.99 once.
- RevenueCat's monthly/annual Plus product mappings exist. The two Skill Pack product records and offering mappings exist in RevenueCat, but App Store Connect does not yet report the matching Apple products. Create the five approved products in App Store Connect and allow RevenueCat to import/verify them.
- Localizations: names, descriptions, subscription renewal copy, Pack descriptions, screenshots, and review notes.
- Review requirements: explain microphone permission, free 30-second challenge, Restore Purchases, and Plus-gated 60/90-second access.
- Terms URL: EXPO_PUBLIC_DROPMIC_TERMS_URL.
- Privacy URL: EXPO_PUBLIC_DROPMIC_PRIVACY_URL.
- App Store URL: leave unset until App Store Connect assigns it.
- EAS production/internal iOS build profiles and the App Store Connect app ID are configured.

## Web and challenge URLs

- Production hostname variable: EXPO_PUBLIC_DROPMIC_WEB_ORIGIN.
- Required route: /challenge/[token].
- HTTPS is required for the production web origin.
- Production web challenge fallback and iOS Universal Links are deployed and have passed direct routing checks.
- Add the final App Store URL to the web fallback once assigned.
- The production hostname is `https://thedropmic.com`.

## Authentication

- Supabase URL variable: EXPO_PUBLIC_SUPABASE_URL.
- Supabase public client key variable: EXPO_PUBLIC_SUPABASE_ANON_KEY.
- SMTP is configured through Resend; one controlled OTP was delivered successfully.
- Redirects: the HTTPS web origin and `micdrop://auth/callback` scheme were validated in the prior release checkpoint.

## Release verification boundary

Remaining release gates are App Store Connect metadata/products, sandbox transaction verification, privacy answers, final screenshots/review notes, and TestFlight submission. No live purchase or App Store submission has been performed.
