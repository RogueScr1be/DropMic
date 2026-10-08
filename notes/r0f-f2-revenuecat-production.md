# RevenueCat production billing path

Status (2026-10-08): client/source implementation is in this checkout and
validated locally. The additive Supabase migration is deployed as
`20261008173934`; `revenuecat-sync` and `revenuecat-webhook` are active at
version 7, and `skill-pack-content` is active at version 1. No purchase or
production billing transaction has been performed.

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

## Remaining production setup before accepting purchases

1. In App Store Connect, create/complete the subscription products:
   `dropmic_plus_monthly` at $4.99/month, and `dropmic_plus_annual` at
   $29.99/year with the approved $19.99 first-year introductory offer for
   eligible subscribers. Add localized names/descriptions and review metadata.
2. Create `dropmic_pack_interview_pro` and `dropmic_pack_founder_pitch` as
   $4.99 non-consumable products. Use the two matching permanent entitlements.
3. In RevenueCat, attach the two Pack products to their separate entitlements
   and add custom offering packages `pack_interview_pro` and
   `pack_founder_pitch` to the `skill_packs` offering. The RevenueCat product
   records, entitlement links, and custom package mappings already exist; the
   Apple products are not yet found in App Store Connect.
4. Verify the RevenueCat app-scoped webhook for TheDropMic points to
   `https://bxoqbbzabubvdbxqquyt.supabase.co/functions/v1/revenuecat-webhook`
   and has the Supabase-matched Authorization header. A dashboard TEST request
   previously returned HTTP 200; a sandbox purchase and restore test remain.
5. Run sandbox monthly, annual, and non-consumable purchase/restore checks;
   verify each RLS-scoped entitlement and that Pack ownership does not grant
   Plus. Do not use a live purchase for this test.
6. Build with `eas build --platform ios --profile production` and submit only
   after App Store listing, privacy, screenshots, review metadata, and test
   account gates are complete.

The webhook secret is a credential; do not commit or paste it into chat. The
RevenueCat iOS public SDK key is safe to embed in the application, but should
still not be printed in build logs or final reports. The existing Plus
offering now exposes only monthly and annual packages; the old Lifetime product
is no longer offered. Its catalog record remains untouched.
