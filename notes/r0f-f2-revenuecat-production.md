# RevenueCat production billing path

Status (2026-10-08): the client/source implementation is validated locally.
The additive Supabase migrations `20261008151740` and `20261008173934` are
deployed; `revenuecat-sync` and `revenuecat-webhook` are active at version 8,
and `skill-pack-content` is active at version 1. The `skill_packs` RevenueCat
offering contains both permanent products. No purchase or production billing
transaction has been performed.

## Client configuration

- The iOS client uses `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` (the Apple
  app-specific public SDK key for `TheDropMic`).
- `EXPO_PUBLIC_REVENUECAT_IOS_TEST_STORE_KEY` is a development-only fallback.
  Production builds never configure the Test Store key.
- The production EAS build profile is `production`; the existing `internal`
  profile remains available for device builds and uses the production EAS
  environment.
- The Expo public key is intentionally a client value, not a RevenueCat
  secret. Never put a RevenueCat secret key in an `EXPO_PUBLIC_` variable.

## Server-side authority

- Purchases and restores request `revenuecat-sync` after the native SDK returns.
- `revenuecat-sync` derives the owner from the verified Supabase session and
  rejects anonymous users. It does not accept an owner ID from the client.
- `revenuecat-webhook` checks the exact configured Authorization header,
  checks the RevenueCat app ID, and reads the latest subscriber snapshot from
  RevenueCat before writing access state. It does not trust purchase fields in
  webhook JSON as entitlement authority.
- Transfers reconcile the current RevenueCat state for each UUID app user ID.
- The migration stores a minimal event envelope only (event ID/type/time and
  owner UUID), with no raw webhook body or subscriber attributes. Event IDs are
  idempotent per owner, and provider snapshot timestamps prevent older reads
  from overwriting newer entitlement state.
- Lifetime access is stored with a far-future `9999-12-31T23:59:59.999Z`
  expiration sentinel because the existing entitlement schema and server RPCs
  require a non-null timestamp. RevenueCat remains the source of truth.
- The Supabase database remains authoritative for paid feature access; the
  app never grants Plus based solely on CustomerInfo or a client purchase
  result.
- Skill Packs are independent, permanent non-consumable purchases. Their
  entitlements are `pack.interview_pro` and `pack.founder_pitch`; neither grants
  Plus. The owner-gated content function returns Pack practice material only
  after verifying both the signed-in owner and the matching permanent Pack
  entitlement.

## Remaining release gates

1. Apple records now exist for `dropmic_plus_monthly` ($4.99/month),
   `dropmic_plus_annual` ($29.99/year with the approved $19.99 first-year
   introductory offer), and both $4.99 non-consumable Packs. RevenueCat has the
   correct product-to-entitlement links and both custom packages in
   `skill_packs`; its App Store status for both Packs is still `Missing
   Metadata`.
2. The owner must provide genuine App Review purchase-flow screenshots for
   both non-consumable products. Apple says the first non-consumable must be
   submitted with a new app version. Complete the app listing screenshots,
   privacy answers, reviewer contact/sign-in details, and review notes as well.
3. The configured RevenueCat app webhook previously returned HTTP 200 for a
   TEST event. Recheck its endpoint and authorization configuration before
   release; do not expose the secret. Then run sandbox monthly, annual,
   non-consumable purchase and restore checks, verifying RLS-scoped
   entitlements and Pack-versus-Plus isolation. Do not use a live purchase.
4. Build the physical iOS release with
   `eas build --platform ios --profile production` after the latest source is
   committed and pushed. The connected EAS dashboard could not be opened from
   this environment, and no local EAS CLI is installed, so no build was
   started here.
5. Verify the paid-app agreement status in App Store Connect. The account
   holder must accept any legal or financial agreement Apple presents. Submit
   to TestFlight/App Review only after the owner completes the preceding
   metadata and privacy gates.

The webhook secret is a credential; do not commit or paste it into chat. The
RevenueCat iOS public SDK key is safe to embed in the application, but should
still not be printed in build logs or final reports. The existing Plus
offering now exposes only monthly and annual packages; the old Lifetime product
is no longer offered. Its catalog record remains untouched.
