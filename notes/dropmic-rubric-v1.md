# DropMic message-effectiveness rubric v1

## What changed

- Replaced provider-selected style labels and free-form normalized grades with 16 evidence-backed 0/1/2 judgments across Clarity, Structure, Specificity, and Concision.
- Drop Score is calculated in code from the 32 possible criterion points. Each dimension uses its raw eight available points; Free and Plus display the same four dimension scores and base score.
- The selected prompt mode, stored topic prompt, and selected duration shape expectations. Current mode profiles cover Cold Take, Freestyle, Interview Basics, Student Basics, Challenge Response, and an unknown-mode fallback. Pack advanced rubrics remain a separate paid capability and are not part of this shared score.
- Coaching selection is code-driven: one strongest criterion, one prioritized/lowest criterion, and one fixed 60-second drill objective. If every criterion scores 2, use a stretch drill. If task alignment scores 0, withhold the overall score.
- If every criterion scores 0, withhold the evaluation rather than fabricate a strength; the take remains available.
- Criterion points and rubric version persist on `analysis_results`. Exact excerpts, rationales, and reason codes persist only on `analysis_transcripts`, sharing its existing 30-day deletion boundary. Existing legacy style values are ignored by result parsing; no new style values are written.
- The Edge Function keeps the old seven-field result envelope for installed clients that omit `resultContractVersion`; the updated client requests the `dropmic-rubric-v2` envelope. Plus-only evidence is attached only after server-side entitlement resolution. An off-task result is returned without an overall score to old clients and with explicit `taskMet: false` to the updated client.

## Assumptions and validation

- All 16 checks apply across current core modes. Duration changes expectations for development, not weights or denominator.
- Core topic prompt IDs have a server-side prompt map; challenge attempts use the stored challenge prompt. Unknown custom/pack task IDs may lack authoritative task text; the evaluator must not invent it and may withhold the score. A trusted Pack task-context source is a follow-up.
- This is a product scoring hypothesis, not a validated scientific instrument. The accepted consented benchmark, human agreement review, dialect checks, and repeated-evaluation gates remain necessary before relying on score trends.
- Full persistence acceptance requires applying the migration in a disposable/local Supabase environment and running pgTAP. The Edge Function now passes Deno type checking against the same Supabase JS package version via a temporary local import map because this environment cannot reach `esm.sh`; the source import remains unchanged. No Docker/Postgres runtime is available here, so pgTAP remains unrun. No remote migration or Edge Function deployment is included.

## Risks and cost

- A context lookup adds one metadata read per analysis. It is owner-scoped in the Edge Function and adds no new table or index.
- The provider now emits criterion evidence/rationales; completion token ceiling rises from 1,200 to 2,400. Actual token use and per-read cost must be measured on a non-production fixture before production rollout.
- Rollout order: apply the additive migration, deploy the backward-compatible Edge Function, then release the client build. The legacy seven-field response path protects installed clients during TestFlight adoption.
- Transcript evidence is private and expires with `analysis_transcripts`; durable scores remain derived metrics and contain no transcript excerpts.

## Rollback and follow-up

- Roll back code to the previous Quick Read version and redeploy it before reversing the migration.
- The migration is additive and has a documented DOWN section. Do not drop the legacy `speaker_vibe` column in this release; older functions or records may still rely on it.
- Next: pgTAP in a disposable/local Supabase stack, Deno type/lint check, task-context fixture tests, calibration benchmark, then separately authorize deployment.

## QA follow-up: share card, score bars, Plus depth, and Take Two recovery

- Removed the score-challenge boast from shared cards; the card now invites the recipient to take the prompt.
- Score bars animate to their numeric score, so 50 fills half the track and 100 fills it completely.
- Plus receives the same four base dimensions, overall score, and concise coaching as Free, plus rubric anchors, exact transcript excerpts, and rationale. The Edge Function enforces Plus access before returning evidence; evidence stays within the private transcript's existing 30-day retention window.
- A failed second Quick Read can be retried once on the same analysis run only when its audio is pending deletion, unexpired, the result is absent, the failure code is allowlisted, and the shared retry budget remains. It creates no analysis run or quota unit. If retry cannot proceed, the UI preserves both Drops and the original comparison baseline.
- The QA screenshot showed a failed second Quick Read, not a failure in score comparison itself. The previous retry action re-requested an idempotent failed run and could not resume it; the explicit server-gated retry repairs that path.
- Validation is local only. The additive retry migration has not been applied, and no function was deployed or invoked. Database-level validation requires local Supabase/Docker and Edge Function type checking requires Deno; neither runtime is available here.
- No EAS build or TestFlight submission was created. Native QA of the result screen remains outstanding before release.
