# DropMic Launch Configuration Manifest

This document is source-controlled and contains names, boundaries, and verification steps only. It intentionally contains no secrets, tokens, customer identifiers, or production credentials.

## Supabase

- Repository project identifier: MicDrop in supabase/config.toml.
- Cloud project reference: `bxoqbbzabubvdbxqquyt` (active/healthy).
- Challenge attribution, link rotation, RevenueCat entitlement sync, and Skill Pack entitlement migrations are applied.
- Active functions include `create-challenge` (JWT required), `resolve-challenge` (public resolver), `revenuecat-sync` (JWT required), `revenuecat-webhook` (custom webhook authorization), and `skill-pack-content` (JWT required plus owner check).
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
- Pack offering: `skill_packs` has custom Interview Pro and Founder Pitch packages mapped to their matching RevenueCat product records and entitlements.
- Pack product/package pairs: `dropmic_pack_interview_pro` / `pack_interview_pro` and `dropmic_pack_founder_pitch` / `pack_founder_pitch`.
- Approved plan: $4.99 monthly, $29.99 annual with an eligible $19.99 first year; Packs are separate $4.99 permanent non-consumables; no Lifetime plan.
- RevenueCat webhook/sync and owner-verified Pack content functions are deployed. No production purchase has been made.

## App Store Connect

- Bundle ID: com.prentisswhitley.dropmic.
- App Store Connect app: `TheDropMic`, Apple ID `6819832149`, bundle `com.prentisswhitley.dropmic`.
- Products: monthly/annual subscriptions plus Interview Pro and Founder Pitch non-consumable products; Lifetime is excluded from the offer.
- Prices: $4.99/month, $29.99/year, eligible annual intro $19.99 for first year, each Pack $4.99 once.
- The two Skill Pack products exist in both App Store Connect and RevenueCat and are mapped to their permanent entitlements. Both Apple records are `Prepare for Submission`; RevenueCat currently reports `Missing Metadata` because the required App Review purchase-flow screenshots have not been uploaded.
- Existing product names/descriptions and U.S. prices are set. No purchase or restore transaction has been run.
- Review requirements: upload genuine purchase-flow screenshots for both Packs; complete the app listing screenshots, privacy answers, reviewer contact/sign-in information, and review notes describing microphone permission, the free 30-second challenge, Restore Purchases, and Plus-gated 60/90-second access.
- The first non-consumable IAP must be submitted with a new app version. Do not submit until the owner completes the App Store metadata and review gates.
- Expo production variables are configured, including the RevenueCat iOS public SDK key and Supabase public client settings. The EAS project currently has internal builds only; no production build exists, and its GitHub build connection is not configured.
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

Remaining release gates are App Review screenshots and listing assets, owner-provided privacy answers and reviewer access details, sandbox purchase/restore verification, an iOS EAS production build, and TestFlight/App Store submission. To trigger an EAS build, either connect `RogueScr1be/DropMic` to the Expo project or provide Expo CLI access through the secure environment. The paid-app agreement must be checked and accepted by the account holder if Apple requires it. No live purchase or App Store submission has been performed.
