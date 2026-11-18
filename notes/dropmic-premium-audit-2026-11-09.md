# DropMic premium-experience audit

**Audit date:** 2026-11-09
**Repository:** `RogueScr1be/DropMic`, branch `main`, HEAD/origin `4dc8135`
**Scope:** iOS-facing core journey source/design review: Quick Read result, Free/Plus distinction, Take Two comparison/recovery, and share card.
**Method:** read-only review of repository source/tests, prior product decisions, and owner-supplied QA screenshots. No app launch, simulator/device interaction, production query, provider call, purchase, or fault injection occurred.

**Follow-up implementation status:** The findings and scorecard below are a point-in-time audit of the pre-fix source at `4dc8135`. A local implementation pass has since ported the accepted rubric and bounded Take Two retry into this canonical `main` worktree, aligned Quick Read/Plus/share styling and copy with shared tokens, and passed client Jest/typecheck/lint/web-export checks. The source remains uncommitted; Supabase migrations and Edge Function have not been applied/deployed, and native/device QA has not been rerun. The audit's original PASS/FAIL/UNKNOWN ratings remain historical baseline ratings, not a claim about current implementation acceptance.

## 2026-11-11 implementation checkpoint

DM-PREM-01 now uses one server-authorized same-run retry. The Edge Function returns `retryAvailable: true` only after verifying owner-scoped run state, an allowlisted failure, pending/unexpired source audio, remaining shared retry budget, unused manual retry, and no stored result. A compare-and-set update and the database transition guard enforce the one-time move. The client fails closed unless the response contains literal `true`; after a lost retry response it checks the same run and does not upload again.

The accepted 16-criterion rubric, equal Free/Plus base score, Plus-only evidence boundary, four dimension labels, proportional score bars, noncompetitive share language, and shared presentation tokens are implemented in the same local branch. No migration or Edge Function has been applied to production, and no app build was created.

Validation on the reconciled worktree: 60 Jest suites / 385 tests, typecheck, lint, web export, Deno check, Deno lint, and `git diff --check` passed. Owner-run local pgTAP was reported as 317/317 before the latest client/Edge-only retry-eligibility changes; SQL migration/test files did not change afterward. The full device matrix remains NOT TESTED here, including physical iPhone recovery, purchase/restore, VoiceOver, Dynamic Type, Reduced Motion, orientation, and background/relaunch.

**Current status:** implementation checkpoint only. The original audit ratings remain historical. Step 4 device acceptance is open, and step 5 backend rollout/TestFlight decision remains deferred until that matrix and the migration/function release review pass.

## Verdict

**BLOCKED — a confirmed P1 blocks the paid Take Two comparison recovery path.** The repository audit is not a whole-product runtime certification.

| Measure | Result |
|---|---:|
| Fixed checklist | 40 items: 0 PASS, 11 FAIL, 29 UNKNOWN, 0 N/A |
| Evidence coverage | 27.5% (11 of 40 items have observed or owner-supplied failure evidence) |
| Owner-reported scenario coverage | 4/10 (40%); independently executed here: 0/10 |
| Evidence-only weighted score | 0.0/100; this means no item passed the audit's complete verification standard, not that the app has no value |
| Gates | 0 PASS, 2 FAIL, 4 UNKNOWN |

The score uses the supplied fixed weights and formula. Every domain has five applicable checks; because runtime, accessibility, commercial, and recovery scenarios were not independently verified, no checklist item qualifies for PASS. The P1 gate takes precedence over the score.

### Three strongest reasons

1. **Take Two cannot recover from a failed second analysis.** The button says “Try Take Two again,” but invokes the same ordinary Quick Read flow and idempotency key. The server returns the existing failed run; no retry transition is requested.
2. **The committed score contract conflicts with the accepted DropMic direction.** It still emits “Speaker Vibe,” calls concision “Directness,” hides base dimensions from Free, and lacks the accepted 16-criterion message-effectiveness rubric.
3. **Plus's distinctive paid outcome is not present.** The paywall promises the “full Quick Read”; current source gives the same strength/fix/drill cards to both plans and only reveals two additional score tiles. The owner-supplied QA says the Plus feedback was the same as Free.

## Product contract and product-specific decisions

**Promised outcome:** help someone practice communicating a prompt response, keep the resulting Drop, and optionally receive useful feedback or compare a second take.

**Primary journey under review:** completed Drop → consent → Quick Read result → optional Plus detail or Take Two → recover/compare → share or return to the saved Drop.

**User context (product hypothesis):** a person practicing spoken communication may be self-conscious, short on time, one-handed, interrupted, or sharing sensitive personal material. These are design inputs, not validated research.

**Decisions to evaluate:**

1. Preserve the user's prompt and duration across Take Two; the source does this, but failed-analysis recovery is broken.
2. Use a DropMic-owned message-effectiveness rubric, not a personality/style label; the accepted decision is not in the current checkout.
3. Keep the scoring standard the same across Free and Plus, while Plus adds evidence and deeper coaching; current presentation instead gates two base scores and does not add the promised evidence.

## Scope, source state, and evidence ledger

The binary version/build currently installed in TestFlight was not available for direct inspection. The latest committed source checked is `4dc8135`. The `DropMic` checkout has 8 modified tracked files, one deleted tracked test, and one pre-existing untracked replacement test. Those changes are uncommitted and were not treated as shipped fixes. In particular, its local score-bar and share-copy edits have not been independently run. A separate older `DropMic-rubric` checkout contains a later uncommitted implementation, but it is not the current `main` source and is excluded from this audit baseline.

| ID | Environment / scenario | Method and evidence | Observation | Status |
|---|---|---|---|---|
| E1 | Current source | `git rev-parse`: `4dc8135`, equals `origin/main`; `git status --short` shows local edits | Establishes source baseline, not installed binary identity | Observed |
| E2 | Quick Read result and Plus presentation | Owner-supplied [DropMic Live QA PDF](sandbox:/workspace/scratch/3d894a4c3a78/upload/dropmic%20live%20qa.pdf), pages 2–3 | Score bars appear full despite varying scores; Plus feedback depth is reported as same as Free; Take Two shows failed Quick Read state | Owner-reported evidence |
| E3 | Quick Read failure state | Owner-supplied [iPhone screenshot](sandbox:/workspace/scratch/3d894a4c3a78/upload/IMG_7694.PNG) | Says recording was kept “for retry” and offers “Try Quick Read again” | Owner-reported evidence |
| E4 | Quick Read error and retry | `src/features/quick-read/QuickReadFlow.tsx:269–291`; `quick-read-service.ts:62–108`; `supabase/functions/quick-read/index.ts` failed-run path | UI retries through normal request; RPC reuses idempotent run and function returns failed terminal status | Source-observed |
| E5 | Score labels, Free/Plus, and paid promise | `QuickReadFlow.tsx:295–319, 339–414`; `PlusPaywall.tsx:105–114` | “Directness” maps to concision; Speaker Vibe remains; Plus gets no deeper feedback content | Source-observed |
| E6 | Share card and design tokens | `ShareCard.tsx:16–24`; `share-service.ts:13–23`; `ui/theme.ts:3–61`; `PlusPaywall.tsx:120–129` | Committed source still challenges recipients to beat the score; several screens use hard-coded colors that diverge from declared tokens | Source-observed |
| E7 | Automated checks | Tests exist, including `r0f-d-take-two.test.ts:282–305`, but were not run in this audit | The recovery test simulates a later successful mocked result after close/reopen; it does not verify server retry of the failed run | Source review; not executed |

### Declared scenario set

1. First use through first saved Drop — UNKNOWN, not run.
2. Complete and retrieve a 30-second Drop — UNKNOWN for this build; prior owner reports are not a current-build replay.
3. Free Quick Read result — OWNER-REPORTED in E2.
4. Plus Quick Read result — OWNER-REPORTED in E2.
5. Score bars / share presentation — OWNER-REPORTED in E2; current committed source was not rendered during this audit.
6. Successful Take Two comparison — UNKNOWN, not run.
7. Failed Take Two analysis and error display — OWNER-REPORTED in E2/E3.
8. Retry after a failed Take Two request — UNKNOWN at runtime; source path is demonstrably non-retrying.
9. Purchase, restore, account change, and entitlement refresh — UNKNOWN, not run.
10. Screen reader, large text, reduced motion, background/resume, and supported rotation — UNKNOWN, not run on the current binary.

## Checklist and scorecard

Codes and weights are unchanged from the supplied audit. All items are applicable to this commercial product; no item was excluded as N/A.

| Domain | Weight | PASS | FAIL | UNKNOWN | N/A | Score | Checklist status |
|---|---:|---:|---:|---:|---:|---:|---|
| D1 Delivered value / judgment | 15 | 0 | 1 | 4 | 0 | 0.0% | V1 U, V2 U, V3 U, V4 U, V5 F |
| D2 State clarity / control | 20 | 0 | 2 | 3 | 0 | 0.0% | S1 U, S2 F, S3 U, S4 U, S5 F |
| D3 Product-wide coherence | 15 | 0 | 2 | 3 | 0 | 0.0% | C1 F, C2 U, C3 F, C4 U, C5 U |
| D4 Recovery / trust | 20 | 0 | 2 | 3 | 0 | 0.0% | R1 U, R2 U, R3 F, R4 F, R5 U |
| D5 Visual / interaction craft | 10 | 0 | 3 | 2 | 0 | 0.0% | Q1 F, Q2 F, Q3 U, Q4 U, Q5 F |
| D6 Accessibility | 10 | 0 | 0 | 5 | 0 | 0.0% | A1–A5 U |
| D7 Responsiveness / platform | 5 | 0 | 0 | 5 | 0 | 0.0% | P1–P5 U |
| D8 Lifecycle / commercial integrity | 5 | 0 | 1 | 4 | 0 | 0.0% | L1 F, L2–L5 U |
| **Total** | **100** | **0** | **11** | **29** | **0** | **0.0/100** | **11 F / 29 U** |

F = FAIL; U = UNKNOWN. Evidence coverage is `(PASS + FAIL) / 40 = 27.5%`. Owner-reported scenario coverage is 4/10; it is not equivalent to independent execution.

### Six gates

| Gate | Status | Evidence |
|---|---|---|
| G1 Delivered outcome | UNKNOWN | One result view is supplied, but retrieval after return/relaunch and current binary identity were not verified. |
| G2 Work / side effects | UNKNOWN | No interruption, lost-response, or duplicate-side-effect test was run. |
| G3 Truth / recovery | FAIL | The failed-run retry button calls the normal idempotent request path and cannot retry the failed analysis. E2/E3 and E4. |
| G4 Accessible core journey | UNKNOWN | Accessibility properties exist in source; current screen-reader/display-setting completion was not run. |
| G5 Coherent facts | FAIL | UI labels a concision score “Directness”; the Plus paywall promises a full Quick Read while adding no evidence-backed coaching in the current source. E5. |
| G6 Regression | UNKNOWN | Existing tests were inspected but not run against the current working tree or binary during this audit. |

## Ranked findings

### DM-PREM-01 — Take Two retry button cannot retry the failed analysis

**Severity:** P1 · **Checklist/gates:** S2, S5, C3, R3, R4, G3
**Journey/state:** Plus result → Take Two → second Quick Read fails → retry action.

**Evidence and reproduction:** Owner screenshot E2 shows the failure after Take Two. In `QuickReadFlow.tsx:283–286`, “Try Take Two again” calls `run()` with no retry distinction. `quick-read-service.ts:74–98` invokes `request_quick_read` with the same attempt/idempotency identity and uploads only when the returned status is `requested`. The Edge Function returns the existing failed status rather than reopening it. The test at `r0f-d-take-two.test.ts:282–305` models a later success after reopening but does not assert a real same-run retry.

**Consequence:** the paid comparison can remain unavailable after a failed second read, while the copy promises retry. The saved Drop may survive, but the promised comparison does not recover in-product.

**Required behavior:** only show a retry if the server confirms the same run is retryable. Resume that same run within its audio-retention and retry limits; if it is not eligible, say “Your second Drop is saved, but this read can’t be retried. Your first read is still saved.” Offer “Keep both Drops” and a clear support route. Preserve the original run and audio without creating another quota entry.

**Validation:** fixture-test eligible, exhausted, expired-audio, concurrent-tap, response-lost, and no-result cases; verify exactly one existing run resumes, no extra quota row is created, and the Take Two baseline survives close/reopen. Then exercise the flow on the supported iPhone/iPad builds with a deterministic non-production failure fixture.

### DM-PREM-02 — Plus does not deliver the promised depth

**Severity:** P2 · **Checklist/gates:** V5, C1, L1, G5
**Evidence:** E2 owner QA and `QuickReadFlow.tsx:295–308`; `PlusPaywall.tsx:105–108`.

The paywall says “full Quick Read.” The feedback cards are the same three fields for both plans; Plus only reveals Structure and Directness score tiles. The owner reports the paid result feels identical to Free. This is a value/promise mismatch, not proof of willingness to pay.

**Required behavior:** apply the accepted 16-criterion DropMic rubric to the same base scores for Free and Plus; preserve one strength, one fix, and one 60-second drill for both. Give Plus exact supporting transcript excerpts and clear criterion rationale, checked against the prompt mode/duration and returned only after server-side Plus entitlement verification. Keep excerpts in the existing private 30-day transcript boundary. Remove “Speaker Vibe.”

### DM-PREM-03 — Score, share copy, and naming undermine confidence

**Severity:** P2 · **Checklist/gates:** C1, Q1, Q2, Q5.

E2 reports bars that visually fill as if every value were 100. The committed `Score` implementation in `QuickReadFlow.tsx:417–448` animates the bar to 100% regardless of its numeric endpoint. `Directness` displays `concision`; Specificity is not shown in the four-tile base grid. `ShareCard.tsx:19–23` retains “I scored X%. Can you beat that?” The product already declares tokens in `ui/theme.ts`, but the paywall and Quick Read use separate literal palettes.

**Required behavior:** show the four agreed base dimensions by the same names on every plan; use a value-proportional bar, reduced-motion equivalent, and accessible numeric label; use invitation copy that asks the recipient to try the prompt; use one shared color/type/spacing token set.

## Journey/state map

| Step | Trigger → state | Visible behavior / source truth | Recovery and status |
|---|---|---|---|
| Quick Read consent | User taps “Upload & get my Quick Read” → processing | Upload and retention notice in `QuickReadFlow.tsx:256–266`; server run owns quota/idempotency | Cancel closes the modal; detailed runtime and cancellation reconciliation UNKNOWN |
| Quick Read success | Server returns completed result → score/feedback | Three coaching cards and score tiles in `QuickReadFlow.tsx:295–308` | “Done” closes; saved result after relaunch UNKNOWN |
| Plus | User opens paywall → chooses package / restore | Dynamic RevenueCat package price, purchase, restore, and manage actions in `PlusPaywall.tsx:102–115` | Store outcomes and changed-account flows UNKNOWN in this audit |
| Take Two | Plus taps Take Two → same prompt/duration second take | Previous run ID retained; comparison uses two run IDs | Successful comparison exists in source; current runtime UNKNOWN |
| Failed Take Two | Provider/schema failure → paused safely | Copy says retry and offers “Try Take Two again” | Retry actually re-requests terminal run; confirmed source gap and owner screenshot |
| Share | User taps Share Result + Challenge → native sheet | `share-service.ts` creates text with score, vibe, and challenge URL | Share recipient flow and privacy review not retested |

## Implementation sequence

1. **Close DM-PREM-01 first.** Define one authorized same-run retry state in the server lifecycle; gate the CTA from the authoritative eligibility result. Keep it within the existing quota, retry budget, ownership, and audio-expiry rules. Test server and UI recovery before deployment.
2. **Integrate the accepted rubric into the canonical `main` checkout.** The current `DropMic` source does not contain the pending implementation from the separate older workspace. Reconcile instead of copying blindly. Keep base scoring identical for Free/Plus; use Plus-only evidence at the server boundary.
3. **Fix the result/share contract once.** Replace Speaker Vibe and Directness; expose Clarity, Structure, Specificity, and Concision. Fix score-bar scaling and remove competitive share copy. Consolidate the Quick Read/paywall style tokens.
4. **Run the complete local and device matrix.** Confirm 30/60/90 flows, saved Drop return, Quick Read success/failure, Take Two success/failure/retry, account switch, purchase/restore, VoiceOver, Dynamic Type, Reduced Motion, portrait/landscape, and background/relaunch.
5. **Only after audit gates pass**, decide backend rollout and a new TestFlight build. This audit did not deploy, migrate, create a build, or submit to Apple.

### Product-specific premium opportunities

1. **Evidence-backed coaching as the Plus upgrade.** Remove the burden of guessing what “improve clarity” means by showing the exact line and the criterion behind it. Measure Quick Read completion, return to another Drop, and eligible retry recovery using content-free events; baseline and targets are UNKNOWN/PROPOSED until instrumented.
2. **Take Two as a guided experiment.** Keep the same prompt and duration and compare the four shared dimensions, then point to one concrete change. This builds on the existing product loop without another feature surface.
3. **A clear saved-Drop return point.** After a Drop, make playback, Quick Read, and Take Two distinct next steps, then return to the same prompt context. Validate on the real supported device and with interruptions.

**Remove:** “Speaker Vibe” and score-brag share copy. They do not help the speaker improve the message and weaken the product's focused coaching point of view.

For the evidence-backed coaching opportunity, the conventional solution is a more verbose paragraph. A stronger alternative is a rubric card with one exact excerpt and criterion rationale; another is transcript-wide annotations, which add reading and privacy burden. The rubric card best fits the one-strength/one-fix/one-drill loop, remains scannable and accessible, and uses the existing transcript retention boundary.

## Limits, rollback, cost, and verification

- **No app source was modified for this audit.** The pre-existing uncommitted source/test changes in `/workspace/scratch/3d894a4c3a78/DropMic` remain untouched; this audit note is the only file added during this review.
- No current build was opened or executed. The provided QA is owner-reported; no screen-reader, performance, orientation, long-session, store purchase, restore, or background-recovery claim is independently passed here.
- No data model, retention schedule, cloud function, deployment, or provider call was changed. The next implementation could use an additive migration only if the bounded retry requires a durable counter. Rollback must deploy compatible old function code before removing that column/transition.
- Cost expectation (proposed): one entitlement lookup per Quick Read that returns Plus-only evidence; one additional provider attempt only on a user-selected eligible retry and only within the existing retry budget. No new analysis run or quota unit. Measure real token cost on a non-production fixture before enabling the richer feedback.
- Suggested proposed performance budgets: acknowledge taps within 100 ms; first useful screen within 1 s after local navigation; provide truthful waiting state by 300 ms; no more than 100 ms input blocking on score animation. These are PROPOSED and require measurement on the minimum supported device/network.
- Repeat exact scenarios 1–10 above on the current internal TestFlight build, record device/build/settings, run accessible text sizes and VoiceOver, then update the same checklist IDs. Run Jest, typecheck, lint, web export, database tests in a local Supabase/Docker stack, and Deno checks before any backend rollout.

## Selected reference

The attached `10 good coding principles` was used as a lightweight engineering lens: keep the retry contract testable, document why it is bounded, avoid introducing a new subsystem, and preserve server-side entitlement/security boundaries. The Claude skill-building guide and Blackbolt plan concern other artifacts/products and were excluded from this DropMic-only audit.
