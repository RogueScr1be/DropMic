# R0F-B1B — Basic Mic Flow experience

## Status

R0F-B1B and its forward timezone repair are locally and remotely accepted.
Migration `20260905000000` and forward repair `20260908000000` are each
deployed exactly once. The first live run failed 23/24; after the bounded
repair, the complete matrix passed 24/24 plus 6/6 repair-specific proofs.

## Deployment and live acceptance evidence

- Starting HEAD matched `768a34446a5b5a1f9f2f22fded750d3a7282f15e`; the index
  was empty and the candidate scope was exactly the designated 13 files.
- B1A migrations `20260903000000` and `20260904000000` matched HEAD.
- Linked project identity matched the application configuration; project health
  was `ACTIVE_HEALTHY` in the accepted development region, `us-west-2`.
- Remote history and the noninteractive dry run showed only `20260905000000`
  pending. Only that migration was applied; history contains it exactly once.
- The RPC owner is `postgres`, volatility is `STABLE`, security mode is
  `SECURITY DEFINER`, and `search_path` is `pg_catalog, public`. Its only
  argument is `p_timezone text`. Authenticated execution is granted; `public`
  and `anon` execution are denied. Ownership comes from `auth.uid()`.

| Required assertion | Result |
| --- | --- |
| 1. Unauthenticated rejection | PASS |
| 2. Anon key without a user rejected | PASS |
| 3. Authenticated own-owner access | PASS |
| 4. Cross-owner isolation | PASS |
| 5. Valid timezone behavior | **FAIL** |
| 6. Invalid timezone rejection | PASS |
| 7. `not_started` | PASS |
| 8. `needs_rep_today` | PASS |
| 9. `protected_today` | PASS |
| 10. `recoverable_with_save` | PASS |
| 11. `reset_pending` | PASS |
| 12. Free Save cap | PASS |
| 13. Active Plus cap | PASS |
| 14. Grace Plus cap | PASS |
| 15. Expired entitlement fallback | PASS |
| 16. Revoked entitlement fallback | PASS |
| 17. Malformed entitlement fallback | PASS |
| 18. Missing entitlement fallback | PASS |
| 19. Best Flow preservation after effective reset | PASS |
| 20. Stale current Flow not presented as alive | PASS: live reset status plus current presentation function |
| 21. Strict response shape | PASS |
| 22. No entitlement details or private owner data | PASS |
| 23. Repeated reads produce zero row mutations | PASS: five reads; nine owner-scoped tables fingerprinted |
| 24. No provider, Edge, Storage, RevenueCat, or Quick Read activity | PASS: harness called only Auth, database, and REST |

### Blocking timezone defect

The remote database confirms `UTC`, `America/Chicago`, and
`America/Indiana/Indianapolis` are valid catalog entries. For the same
protected owner, the first two return `protected_today`; the third returns
`unavailable`. The requested-timezone regex in the B1B migration admits only
one slash. The stored-timezone guard has the same restriction. The existing
B1A completion RPC also uses this restriction, so changing the read RPC alone
would not establish consistent completion behavior for those timezones.

No remote rollback was performed. Forward migration `20260908000000` replaces
the exact deployed definitions of both RPCs and changes only timezone
validation: requested and stored names must be exact members of
`pg_catalog.pg_timezone_names`. Caller values are not trimmed, normalized, or
rewritten. This catalog policy accepts recognized multi-segment and symbolic
names while rejecting blank, fabricated, case-mismatched, whitespace-padded,
and injection-shaped values. Migrations `20260903000000`, `20260904000000`,
and `20260905000000` remain byte-identical.

### Repair validation and final live acceptance

- Clean local reset: PASS, including `20260908000000`.
- Full database suite before rollback: 8 files, 261 assertions, PASS.
- Focused repair/B1A/B1B suites: 55 + 85 + 34 assertions, PASS.
- Project-scoped local rollback: both RPCs returned `unavailable` for
  `America/Indiana/Indianapolis`, proving the old limitation returned.
- Clean repair reapplication: completion returned `credited`; snapshot returned
  `protected_today` for the same zone.
- Full database suite after reapplication: 8 files, 261 assertions, PASS.
- Local fixture verification: Auth users, Flow state, completions,
  entitlements, and Storage all zero.
- Focused Mic Flow Jest: 3 suites, 24 tests, PASS.
- Full Jest: 25 suites, 159 tests, PASS.
- Typecheck and lint: PASS.
- Browser acceptance run independently: responsive 1/1, recording 1/1, Auth
  callback 3/3, PASS. A combined parallel run timed out two long transitions;
  each affected test passed alone within its configured timing contract.
- Web export and `git diff --check`: PASS.
- Remote preflight: linked MicDrop project `ACTIVE_HEALTHY`; only
  `20260908000000` pending; dry run proposed exactly that migration.
- Deployment: exactly `20260908000000`, PASS. Both migrations now appear once.
- Remote metadata: both RPCs retain `postgres` ownership, signatures,
  volatility, `SECURITY DEFINER`, `search_path=pg_catalog, public`, authenticated
  and service-role execution, and public/anon denial. Both use the same exact
  catalog policy.
- Final live acceptance: original matrix 24/24; repair proofs 6/6. Proofs cover
  completion and snapshot acceptance of `America/Indiana/Indianapolis`, a
  second recognized multi-segment name, invalid-lookalike rejection, identical
  policy, and zero snapshot writes.
- Two exact live owners were created. Before acceptance they had 2 Auth users
  and 2 trigger-created profiles, with zero Flow/content rows. After tests they
  had 2 Flow states and 1 completion, with no entitlement, Storage, attempt, or
  analysis residue. Exact Auth deletion then reduced every scoped count—Auth,
  profiles, preferences, Flow state, completions, entitlements, Storage,
  attempts, and analysis runs—to zero.

### Fixture accounting and cleanup

Counts below apply only to exact live fixtures, never global remote tables.

| Fixture group / point | Auth users | Flow states | Completions | Entitlements | Storage objects | Attempts | Analysis runs |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Initial pair before checks | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| Initial pair after exact cleanup | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Supplemental owner before checks | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| Supplemental owner after repeated reads | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| Supplemental owner after exact cleanup | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

The initial pair passed 21 assertions before a harness query incorrectly
referenced `profiles.id` instead of `profiles.user_id`. That pair was cleaned
up before a supplemental owner ran the remaining three checks using the
correct column. Row fingerprints include Auth users, profiles, preferences,
Flow state, completions, entitlements, attempts, analysis runs, and Storage
metadata. No live identity, email, credential, or row fingerprint is recorded
here. All three newly created users were deleted through Auth administration.

The accidental anonymous-user incident remains unresolved: its captured
identity was not available in the supplied evidence. No identity was guessed,
no broad timestamp search was run, and no unrelated remote user was deleted.

### Local review cleanup and remaining gates

The exact DropMic bundle was removed from the iPhone 16e and iPad Pro 13-inch
(M5) review simulators. Their persisted sessions matched exactly two local
users; one had become permanent. Both local users were deleted. Local Auth
users, Flow states, completions, entitlements, and Storage objects verified
zero. The verified review Metro process and sanitized temporary copy were
removed; the original repository dependency directory was preserved.

The initial migration packaging attempt omitted statement terminators between
two definitions returned by `pg_get_functiondef`; the clean reset failed before
schema application completed. Semicolons were added to the forward and local
rollback files, and the required clean reset and all subsequent gates passed.

## User experience

The main practice screen includes a compact Mic Flow card with states for no
Flow, protected today, a needed rep, one recoverable missed day, and a pending
reset. It shows only server-derived current Flow, best Flow, and Mic Save
counts. Loading and unavailable states never fabricate zero values.

The completion screen reports Mic Flow only after the B1A completion RPC
returns a validated response. A one-day recovery opens an explicit modal with
“Use Mic Save” and “Continue without Save”; no mutation occurs before the
choice, and a failed choice leaves the decision recoverable.

## Read authority

`public.get_mic_flow_snapshot(text)` is a read-only, authenticated,
`SECURITY DEFINER` RPC with a fixed `search_path`. It derives the owner from
`auth.uid()`, validates the supplied IANA timezone, uses database server time,
reads the owner’s existing state and entitlement, and returns one of
`not_started`, `protected_today`, `needs_rep_today`, `recoverable_with_save`,
`reset_pending`, or `unavailable`. It performs no writes and does not
authorize paid actions.

The client calls this RPC through `getMicFlowSnapshot`; it does not classify
raw state columns. Snapshot requests are invalidated on sign-out, account
switch, and foreground refresh races. A small owner-bound coordinator coalesces
same-owner refreshes, uses a bounded request window, and force-invalidates older
work after a completion. Every authoritative auth transition advances the Mic
Flow generation, including sign-out before an anonymous identity is captured,
so late session or snapshot results cannot become active. Anonymous
authenticated owners can view their own state, while recording remains usable
without connectivity and unowned completions receive no credit. A reset-pending
card hides the stale current Flow number while preserving Best Mic Flow and
Save capacity.

## Deferred

Advanced Flow analytics, history, notifications, sharing, challenges,
additional modes, purchases, paywalls, RevenueCat reconciliation, Packs,
background jobs remain deferred.
