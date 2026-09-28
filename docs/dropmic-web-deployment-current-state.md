# DropMic Web Deployment Current State

Recorded 2026-09-28 after the authorized DMVP-LAUNCH-D2R-B2 deployment.

## Production hosting

- Cloudflare Pages project: `thedropmic`
- Production deployment: `a99c0562-90f7-4e8c-ac4e-57a6e06140d8`
- Deployment URL: `https://a99c0562.thedropmic.pages.dev`
- Project URL: `https://thedropmic.pages.dev`
- Production domains: `https://thedropmic.com` and `https://www.thedropmic.com`
- `www` is configured as a deliberate Pages alias to the same deployment, not a redirect.
- Pages plan remains Free; no paid hosting feature was enabled.

## DNS and email routing

The pre-deployment DNS audit found no records for `thedropmic.com` in the scoped
Cloudflare zone. The configured records after deployment are:

- CNAME `thedropmic.com` -> `thedropmic.pages.dev`
- CNAME `www.thedropmic.com` -> `thedropmic.pages.dev`
- MX priorities 95, 8, and 15 -> Cloudflare Email Routing MX hosts
- SPF TXT for Cloudflare Email Routing
- Cloudflare Email Routing DKIM TXT for the domain

Email Routing is active for `support@thedropmic.com` and forwards to the existing
verified Cloudflare account email. The catch-all rule remains disabled with Drop
selected; no catch-all forwarding was created.

## Web routes and headers

- `/`, `/privacy`, and `/terms` are statically exported and served over HTTPS.
- `/challenge/<token>` rewrites to the Expo static challenge page and supports direct
  navigation and refresh without exposing a token in a redirect.
- Challenge responses set `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow`.
- The challenge page includes a client-side safe invalid/missing-token state. No live
  challenge token was opened or resolved during deployment validation.
- Legal pages identify the operator as Prentiss Whitley and use
  `support@thedropmic.com`; they do not invent a company or governing jurisdiction.

## Scope boundaries

- Universal Links/App Links are not configured; installed-app handoff remains outside
  this web deployment.
- No Supabase migration or function deployment was performed.
- No Quick Read/provider call, OTP, new user, purchase, RevenueCat/App Store Connect
  change, TestFlight action, or live challenge was performed.
- The scoped Cloudflare token verified as active by presence and token-status response,
  but did not grant Pages or Email Routing API permissions; the already authenticated
  Cloudflare owner dashboard performed the authorized Pages and routing changes.

## Rollback

Rollback is available through the Cloudflare Pages deployment history by restoring a
previous deployment, or by reverting the source commit and uploading a newly validated
export. DNS and Email Routing should remain in place during a web-only rollback.
