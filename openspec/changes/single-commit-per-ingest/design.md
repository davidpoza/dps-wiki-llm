## Context

The ingest pipeline runs in two modes:
- **unattended**: baseline → connections → done (all in one `run()` call)
- **validated**: baseline → AWAITING_REVIEW; then connections committed separately when the user submits a review via `GuidedReviewService.review()`

Currently `IngestPipelineService.run()` calls `gitService.commitOperation("ingest-baseline")` mid-pipeline, then calls `guidedReviewService.applyAccepted()` which internally calls `gitService.commitOperation("guided-review")`. This produces two commits for every unattended ingestion.

The `validated` path is correct: one commit for the baseline, then a separate commit when the user explicitly approves connections via the review endpoint. That path must NOT be changed.

## Goals / Non-Goals

**Goals:**
- Unattended ingestion produces exactly one git commit containing all file mutations (source note, INDEX.md, connection link patches, idempotency ledger, change log).
- The commit message clearly identifies the ingestion (title + connection count).
- `Job.commitRange` stores a single `before..after` range for unattended jobs.
- The fix is surgical; no unrelated refactoring.

**Non-Goals:**
- Changing the `validated` flow (still commits baseline immediately, connections on review).
- Changing `GitService` public API.
- Adding batch/transactional git staging beyond what's needed.

## Decisions

### Decision 1: pass `commit=false` flag to `applyAccepted` instead of extracting a new method

`GuidedReviewService.applyAccepted()` is called from two places:
1. `IngestPipelineService.run()` — unattended path (should NOT commit)
2. `GuidedReviewService.review()` — user-initiated review (SHOULD commit)

**Options considered:**
- A) Add `boolean commitImmediately` parameter to `applyAccepted`.
- B) Split into `applyAcceptedNoCommit()` + `applyAccepted()`.
- C) Move commit responsibility entirely to the caller; `applyAccepted` always skips commit and the caller commits.

**Chosen: A** — simplest change, keeps logic in one place, and the flag clearly communicates intent at the call site.

### Decision 2: collect all changed paths in `IngestPipelineService.run()` and commit once at the end

`IngestPipelineService.run()` already has visibility over all mutation results. After all steps complete, it aggregates changed paths from:
- baseline (`sourceNotePath`, `INDEX.md`)
- connections (`result.created()`, `result.updated()`)
- idempotency ledger (`state/runtime/idempotency-keys.json`)

Then calls `gitService.commitOperation(...)` once with the combined path list and a message that includes the title and connection count.

### Decision 3: change log file — one per ingestion

`commitOperation` writes a `state/change-log/<stamp>-<type>.md`. With a single commit we write one file with type `ingest`. This replaces the two separate log files that would have been written before.

## Risks / Trade-offs

- [Risk] If the connections step throws after the baseline files are written, the rollback (`resetHard`) still handles it correctly — no commit was made, so there is nothing to undo in git. This is actually safer than before (previously a half-committed baseline would have needed a revert).
- [Trade-off] The `commitImmediately` boolean on `applyAccepted` is a mild primitive-obsession smell. Acceptable given the simplicity of the fix; a richer "commit context" object could be introduced later if more callers emerge.

## Migration Plan

No data migration needed. Existing jobs already in the database retain their stored `commitRange` (which may contain two ranges separated by comma). `JobRevertService` already handles comma-separated ranges via `parseCommitRanges`, so old jobs continue to revert correctly.
