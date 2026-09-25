# DropMic Launch Authorization Package

This is a review package only. It is not an instruction to deploy.

## Supabase change

- Migration: supabase/migrations/20260924000000_launch_challenges_and_analytics.sql
- Functions:
  - create-challenge: JWT verification enabled.
  - resolve-challenge: JWT verification disabled for public challenge landing pages.
- New database boundary: challenge_links stores only hashed tokens and public prompt metadata; source_attempt_id is owner-checked by a fixed-search-path security-definer trigger.
- Analytics boundary: analytics_events is insert-only for clients, owner_id must be null, event names are constrained, and event_key is unique.
- Dry-run result: SQL reviewed statically; pgTAP not executed because Docker is unavailable.
- Existing deployed state to preserve: Quick Read v16, Quick Read Cleanup v4, Take Two v1, QA8B orphan-audio cleanup, quota, transcript retention, provider adapters, and account deletion.

## Required environment names

- SUPABASE_PROJECT_REF
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- EXPO_PUBLIC_SUPABASE_URL
- EXPO_PUBLIC_SUPABASE_ANON_KEY
- EXPO_PUBLIC_DROPMIC_WEB_ORIGIN
- EXPO_PUBLIC_DROPMIC_TERMS_URL
- EXPO_PUBLIC_DROPMIC_PRIVACY_URL
- EXPO_PUBLIC_REVENUECAT_IOS_TEST_STORE_KEY

No values are included here.

## Remote validation plan

1. Apply the migration in a reviewed change window.
2. Deploy the two functions with the JWT settings above.
3. Verify valid challenge creation requires a permanent user and owned attempt.
4. Verify malformed, unknown, expired, and disabled links fail safely.
5. Verify public resolution returns only prompt, category, duration, timestamps, status, and no owner/source/audio/transcript data.
6. Verify anonymous and cross-owner table access is denied.
7. Run pgTAP and one controlled sandbox flow.

## Rollback

Do not delete production recordings, attempts, transcripts, Quick Read results, entitlements, or analytics. If validation fails, disable the two new functions and revoke their new client path, then apply the reviewed additive rollback for the new challenge/analytics objects only. Existing Quick Read, cleanup, Take Two, quota, transcript, provider, and account-deletion paths remain untouched.

## Owner checkpoints

RevenueCat products/entitlement/webhook, App Store Connect products and metadata, production web hostname/deployment, SMTP sender/domain/OTP, and legal URLs require explicit dashboard configuration and are not changed by this repository checkpoint.
