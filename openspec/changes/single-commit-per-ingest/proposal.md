## Why

Each ingestion job currently produces multiple git commits — one for the baseline step and one for the connections step — making the git history noisy and complicating job revert (which must handle multiple commit ranges). The invariant should be: one ingestion = one atomic commit.

## What Changes

- Remove the intermediate "ingest-baseline" commit from `IngestPipelineService`; accumulate all file changes across the pipeline (baseline + connections) and commit once at the end.
- `GuidedReviewService.applyAccepted()` must NOT commit when called from the unattended pipeline; the commit is deferred to the pipeline's final step.
- The single final commit message summarises the full ingestion (title, source ID, connection count).
- `Job.commitRange` remains a single range (one SHA span) for unattended jobs.
- The `validated` (AWAITING_REVIEW) branch is unaffected — it already commits only the baseline, and the connections commit happens separately when the user submits the review.

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- (none — this is a behavioural fix to the ingest pipeline internals; no public API or spec-level contract changes)

## Impact

- `IngestPipelineService` — remove intermediate `commitOperation` call; collect all changed paths; commit once at the end.
- `GuidedReviewService.applyAccepted()` — add a boolean parameter (or extract a no-commit variant) so the caller can control whether a commit is made.
- `GitService` — no interface changes needed; existing `commitOperation` is reused for the final combined commit.
- `JobRevertService` — no change needed; it already revert-commits the stored `commitRange`, which will now always be a single range.
- Tests: `IngestPipelineServicesTests`, `GuidedReviewService` (if tested) need updating.
