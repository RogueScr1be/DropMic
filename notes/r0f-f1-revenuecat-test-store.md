# R0F-F1 — RevenueCat Test Store Foundation

Status: local iOS identity foundation only. No purchase, restore, paywall,
reconciliation, webhook, account-deletion provider cleanup, or paid access is
live.

## Boundary

The iOS bundle identifier is `com.prentisswhitley.dropmic`. App Store Connect
and Apple Sandbox are intentionally not configured yet. R0F-F1 uses the
RevenueCat Test Store as the first integration environment and requires an iOS
development build; it does not add `react-native-purchases-ui`.

The adapter reads only the public Test Store SDK key from
`EXPO_PUBLIC_REVENUECAT_IOS_TEST_STORE_KEY`. A RevenueCat server credential is
not present in the client. The public key does not authorize Premium access.

## Identity contract

Only a permanent authenticated Supabase session may configure the SDK. The
RevenueCat App User ID is exactly `session.user.id`, the stable
`auth.users.id`. Anonymous and signed-out sessions leave billing unavailable.

The SDK is configured at most once per native process. A later permanent-user
switch calls `logIn(newUserId)` directly. The adapter never calls RevenueCat
`logOut()` because that creates a new anonymous RevenueCat identity. On
sign-out it clears app-owned billing availability only; the native SDK cannot
be deconfigured during the process.

Offerings are fetched only when the current permanent session matches the
adapter's active UUID. No CustomerInfo or offerings are used as authorization.

The SDK client is resolved through platform-specific modules: iOS is the only
platform client that imports RevenueCat, while web and other native platforms
use fail-closed clients with no native purchase import. Identity transitions
use a monotonically increasing generation. Every post-await identity and
offering result is discarded when that generation, desired UUID, permanent
session, or active confirmed UUID no longer matches.

## Deferred work

Purchase and restore flows, custom paywall UI, server reconciliation, webhook
lifecycle synchronization, provider-first account deletion, App Store Connect,
Apple Sandbox, Android, web billing, Packs, and any new schema remain deferred.

The next phases are R0F-F2 server reconciliation, R0F-F3 purchase/restore UX,
R0F-F4 webhook lifecycle handling, R0F-F5 Settings and provider deletion, and
R0F-F6 Test Store followed by Apple Sandbox acceptance.
