# RevenueCat production billing path

Status: source implementation and tests are ready; production Supabase
migration, Edge Functions, and RevenueCat webhook settings have not been
deployed from this checkout.

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

## Required production setup before accepting purchases

1. Add the TheDropMic public iOS SDK key to EAS as a Sensitive `production`
   environment variable named `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY`. This
   browser session could not transfer the RevenueCat copy action into the EAS
   form, so the value has not been entered here.
2. Apply `20261008000000_revenuecat_webhook_sync.sql` to the existing Supabase
   project.
3. Set Supabase Edge Function secrets:
   - `REVENUECAT_IOS_PUBLIC_API_KEY` to the same public iOS SDK key used by EAS.
   - `REVENUECAT_APP_ID` to the RevenueCat app identifier shown in TheDropMic
     app settings (`appe887860c65`).
   - `REVENUECAT_WEBHOOK_AUTHORIZATION` to a newly generated high-entropy
     bearer value.
4. Deploy `revenuecat-sync` and `revenuecat-webhook`.
5. In RevenueCat, create an app-scoped webhook for the TheDropMic app pointing
   to `https://bxoqbbzabubvdbxqquyt.supabase.co/functions/v1/revenuecat-webhook`
   and set its Authorization header to the exact value stored in the Supabase
   secret. Send both production and sandbox events during testing.
6. Send a RevenueCat dashboard test event, then make one Apple sandbox purchase
   and verify the resulting RLS-scoped Plus row. Do not use live purchase flow
   for this test.
7. Build with `eas build --platform ios --profile production` and submit only
   after the separate App Store listing, privacy, review-login, and IAP metadata
   gates are complete.

The webhook secret is a credential; do not commit or paste it into chat. The
RevenueCat iOS public SDK key is safe to embed in the application, but should
still not be printed in build logs or final reports.
