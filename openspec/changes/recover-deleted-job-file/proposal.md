## Why

When a job deletes a file, the jobs panel shows that file with a red **DELETE** chip, but the only way to bring the file back is to revert the *entire* job — which also undoes every other change that job made. Users need to recover a single deleted file, with the exact content it had before deletion, without touching the rest of the job.

## What Changes

- Add a backend endpoint that recovers one deleted file from a completed job's snapshot, recreating it in the vault with the content it had immediately before it was deleted (`SnapshotFile.contentBefore`).
- The recovery is a single-file write that reuses the existing snapshot/versioning pipeline, so it is itself recorded in history (reversible via file versions), reindexed, and replicated to WebDAV.
- Add a **RECOVER** button in the jobs viewer next to every file entry that carries the `delete` action chip. Clicking it recovers only that file and leaves the rest of the job untouched.
- Guard against clobbering: if a file already exists at the target path (e.g. it was recreated later), the recovery is rejected as a conflict rather than overwriting current content.
- Add English/Spanish translations for the new button and its recovered state.

## Capabilities

### New Capabilities
- `recover-deleted-job-file`: Recovering an individual deleted file from a job's snapshot — the backend recovery endpoint and the per-file RECOVER action in the jobs viewer.

### Modified Capabilities
<!-- None. The existing `revert-job-file-chips` capability (how DELETE/UPDATE/CREATE chips are emitted and rendered) is unchanged; the RECOVER action is purely additive and attaches to the already-rendered delete chips. -->

## Impact

- **Backend**: `JobController` (new `POST /api/jobs/{id}/files/recover` endpoint), `FileService` (recreate-from-snapshot write reusing the snapshot + index + WebDAV-push sequence), `SnapshotService` (locate the deleted file's `contentBefore` for a given job snapshot).
- **Frontend**: `jobs-viewer.component.ts` (RECOVER button + click handler + recovered-state tracking), `api.service.ts` (new `recoverDeletedFile` call), `assets/i18n/en.json` and `assets/i18n/es.json` (new labels).
- **Data**: No schema changes — reuses existing `snapshots` / `snapshot_files` tables.
