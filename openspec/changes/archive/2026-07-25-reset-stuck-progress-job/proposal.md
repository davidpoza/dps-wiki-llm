## Why

When the backend container is redeployed mid-execution, jobs left in `PROGRESS` (or `STARTED`) status become permanently stuck — they will never transition out on their own, and there is no way for the user to clear them. A manual "abandon" action is needed to mark a stuck job as `FAILED` without reverting the file changes it may have already applied.

## What Changes

- New `POST /jobs/{id}/abandon` endpoint that transitions a `PROGRESS` or `STARTED` job to `FAILED` with a standard "Abandoned by user" error message.
- `JobLifecycleService` gets an `abandonJob(UUID)` method enforcing the allowed source states.
- The jobs-viewer UI shows an "Abandon" button on job cards whose status is `PROGRESS` or `STARTED`, alongside (not replacing) the existing cancel button.

## Capabilities

### New Capabilities

- `abandon-stuck-job`: Force a job in `PROGRESS` or `STARTED` to `FAILED` state via a backend endpoint and a UI button, without touching the git working tree.

### Modified Capabilities

- `cancel-awaiting-review-job`: No requirement changes — the cancel endpoint remains restricted to `QUEUED` / `AWAITING_REVIEW`; abandon is a separate action.

## Impact

- **Backend**: `JobController` (new endpoint), `JobLifecycleService` (new method).
- **Frontend**: `jobs-viewer.component.ts` + its template (new button, new API call).
- **No DB schema changes**: uses the existing `FAILED` status and `error` field.
- **No revert**: does not create a `REVERT` job or touch git history.
