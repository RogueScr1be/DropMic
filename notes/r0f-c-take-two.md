# R0F-C — Local Take Two Server Capability

Status: local implementation only. The function is not deployed and no paid
capability is exposed.

## Discovered data contract

The existing schema provides the prompt identity required for a two-take
comparison. Each `analysis_runs` row points to an `attempts` row through
`attempt_id`; `attempts.topic_id` is the stored prompt identity. The function
requires exact equality of those two owner-scoped topic IDs and adds no table
or migration.

Completed Quick Read values are already durable in `analysis_results` and
`attempt_metrics`. The function reads only the four Quick Read scores plus
`word_count`, `words_per_minute`, and `filler_word_count`. It never reads
Storage audio or `analysis_transcripts`.

## Comparison contract

`POST /functions/v1/take-two` accepts only:

```json
{
  "firstRunId": "<completed run UUID>",
  "secondRunId": "<completed run UUID>"
}
```

The bearer token is verified with the existing server pattern. The owner UUID
comes only from that verified user. The client cannot supply `owner_id`.
Anonymous users and users without an allowed server-side Plus entitlement are
denied.

The response orders the two runs by `created_at`, then run ID, and labels them
`baseline` and `followUp`. Each snapshot contains the run/attempt IDs, creation
time, four scores, and three supporting metrics. `deltas` are raw
`followUp - baseline` values rounded to three decimal places. No directionality
or `improved` conclusion is invented.

Missing or malformed durable results/metrics return
`comparison_unavailable`. Cross-owner or missing runs return the same not-found
response without revealing existence. Duplicate runs, different prompts, and
non-completed runs are rejected. The function makes no provider calls and
writes no database rows.

## Security and blast radius

Authorization is fail-closed through the R0F-B resolver. Every repository read
is filtered by the verified owner UUID; cross-owner runs therefore collapse to
not-found. The function has no purchase SDK, webhook, Storage, transcript, AI,
or mutation path. Its blast radius is limited to a new undeployed Edge Function
and shared pure comparison code.

## Deferred combined gate

Before deployment, the owner must supply the service-role credential through
the approved secure workflow once. The combined gate must prove the 12 R0F-B
API assertions, deploy this function, and run Take Two live acceptance with
disposable identities and zero residue. RevenueCat purchases, restore,
webhooks, paywall UI, and store configuration remain deferred.

## Cost and rollback

Local code has no provider or runtime cost and does not add an AI call. The
future deployed function adds only bounded database reads. Rollback is deleting
the undeployed `take-two` function and its shared code; no database rollback is
needed because this phase adds no schema.
