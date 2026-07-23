## Why

When a REVERT job runs, files that were originally created by the INGEST job get deleted from the vault, but the job viewer shows all affected files with a generic "modified" chip. Users cannot distinguish which files were actually deleted versus which were restored to a prior version.

## What Changes

- Backend emits `fileEvent` SSE messages with `"delete"` action during revert execution for files that are deleted (those whose `contentBefore` was `null` in the original INGEST snapshot), and `"update"` for files that are restored.
- REST `GET /api/jobs` response adds a `fileEvents` field (`[{path, action}]`) so historical (already-completed) REVERT jobs also show correct chips when reloaded.
- Frontend adds an `.action-delete` chip style (red/danger) to the job card file list.
- Frontend `mergeHistory()` uses `fileEvents` (when present) instead of hardcoding `'modified'` for all `affectedPaths`.

## Capabilities

### New Capabilities

- `revert-job-file-chips`: Show file-level action chips (DELETE / UPDATE) in the REVERT job card, both live (via SSE) and for historical jobs (via REST).

### Modified Capabilities

_(none — no existing spec-level behavior changes)_

## Impact

- **Backend**: `JobRevertService` (emit file events), `SnapshotService` (expose snapshot files with metadata), `JobSummary` DTO (add `fileEvents`), `JobController` (build `fileEvents` from snapshot for job summaries).
- **Frontend**: `jobs-viewer.component.ts` (add `.action-delete` CSS), `jobs.store.ts` (`mergeHistory` uses `fileEvents`), `api.service.ts` (update `JobSummary` interface).
- **No breaking changes** — `affectedPaths` remains in the DTO for backward compatibility; `fileEvents` is additive.
