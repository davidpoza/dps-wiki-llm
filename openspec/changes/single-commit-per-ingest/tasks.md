## 1. Modify GuidedReviewService

- [x] 1.1 Add `boolean commitImmediately` parameter to `GuidedReviewService.applyAccepted(Job, List<JobConnectionCandidate>, String, boolean)` and guard the `gitService.commitOperation(...)` + `recordOperation(...)` block behind it
- [x] 1.2 Update the internal `review()` → `applyAccepted(...)` call to pass `commitImmediately=true`

## 2. Modify IngestPipelineService

- [x] 2.1 Move the `gitService.commitOperation("ingest-baseline", ...)` call so it only executes in the `validated` branch (before the early return to AWAITING_REVIEW); remove it from the unattended path
- [x] 2.2 Call `guidedReviewService.applyAccepted(job, candidates, ..., false)` (no commit) in the unattended branch and capture the returned `MutationResult`
- [x] 2.3 After `applyAccepted` returns, collect all changed paths (baseline paths + `result.created()` + `result.updated()` + idempotency ledger) and call `gitService.commitOperation("ingest", ...)` once with a combined message (title + connection count)
- [x] 2.4 Call `recordCommitMetadata` once with the combined commit range and all affected paths, replacing the existing early call

## 3. Update tests

- [x] 3.1 Update `ingestPipelineCreatesBaselineSourceNoteAndCommit` to assert that exactly one new commit is created (count of commits ahead of the pre-ingest SHA)
- [x] 3.2 Add a test `unattendedIngestWithConnectionsProducesExactlyOneCommit` that uses a real `GuidedReviewService` (or a partial integration) and verifies the git log has one commit for the full ingestion
- [x] 3.3 Update mock call-site in `unattendedIngestAutoAppliesAcceptedCandidates` and related tests to match the new 4-arg `applyAccepted` signature (add `anyBoolean()` matcher)
- [x] 3.4 Verify the `validatedIngestPausesForGuidedReviewCandidates` test still passes and that the `validated` branch still produces exactly one (baseline) commit before pausing
