## Context

The job viewer shows per-file chips (CREATE / UPDATE / READ / MODIFIED) for INGEST jobs. During revert, some files are physically deleted from the vault (those created by the original INGEST job), while others are restored to their prior content. Currently the revert pipeline never calls `lifecycleService.fileEvent()`, so no file chips appear at all during revert execution. For historical (already-completed) REVERT jobs, the REST summary maps all `affectedPaths` to the hardcoded action `"modified"`, losing the delete/restore distinction.

Key data model facts:
- `Snapshot` / `SnapshotFile`: each file entry stores `contentBefore` and `contentAfter`. In the TARGET (INGEST) snapshot, `contentBefore == null` means the file was **created** by INGEST (and therefore must be **deleted** by revert). `contentBefore != null` means it was **modified** (and will be **restored**).
- `JobLifecycleService.fileEvent(job, path, action)` broadcasts a `PROGRESS` SSE event with `step = "file"`. The frontend `jobs.store.ts` already handles this to append to `job.files`.
- `JobSummary` DTO currently returns `List<String> affectedPaths`; the frontend maps all of them to `{path, action: 'modified'}`.

## Goals / Non-Goals

**Goals:**
- Emit `fileEvent` SSE messages with `"delete"` or `"update"` action during revert execution (live view).
- Return per-file actions from `GET /api/jobs` for already-completed jobs (historical view).
- Display a red "DELETE" chip in the job card for deleted files.

**Non-Goals:**
- Changing chip display for non-revert job types.
- Retroactively fixing REVERT jobs completed before this change (they will keep showing "modified" from old `affectedPaths` data, since historical snapshot data isn't backfilled).

## Decisions

### 1. Determine delete vs. update by inspecting the TARGET snapshot before `hardReset`

**Decision**: Before calling `hardReset(targetSnapshotId)`, query the target snapshot's `SnapshotFile` list. A file with `contentBefore == null` will be deleted; one with `contentBefore != null` will be restored. Emit `fileEvent(job, path, action)` for each file after `hardReset` completes (the order of events vs. hardReset doesn't matter for correctness; doing it after keeps the code linear and avoids emitting for files that might fail mid-reset).

**Alternative considered**: Emit events inside `SnapshotService.hardReset()` via a callback or return value. Rejected because `hardReset` is a domain service that shouldn't know about broadcasting; `JobRevertService` already orchestrates the full sequence.

### 2. Expose `getSnapshotFiles(UUID)` on `SnapshotService`

**Decision**: Add a public `getSnapshotFiles(UUID snapshotId)` method returning `List<SnapshotFile>`. The existing private `snapshotFileRepository.findBySnapshotId()` call in `hardReset` can be reused. This keeps all snapshot-data access behind the service layer.

### 3. Add `fileEvents` to `JobSummary` DTO (additive, backward-compatible)

**Decision**: Add `List<FileEventDto> fileEvents` (record: `{String path, String action}`) to `JobSummary`. In `JobController`, for each job that has a `snapshotId`, query the snapshot files to derive actions (`contentAfter == null` → `"delete"`, else → `"update"`). Keep `affectedPaths` field unchanged for backward compat.

**Alternative considered**: Replace `affectedPaths` with `fileEvents`. Rejected — backward compat risk for any other clients.

**Alternative considered**: New dedicated endpoint `GET /api/jobs/{id}/files`. Rejected — would require N extra HTTP requests in the frontend; simpler to enrich the existing jobs list.

### 4. Frontend: `mergeHistory` uses `fileEvents` when present

**Decision**: In `jobs.store.ts`, if `j.fileEvents` is non-empty, map those to `{path, action}`. Otherwise fall back to `affectedPaths` mapped to `'modified'` (existing behaviour). This handles old jobs gracefully.

### 5. CSS chip: `.action-delete` styled red

**Decision**: Add `.action-delete { background: #ef4444; }` alongside the existing `.action-create`, `.action-update`, etc. in `jobs-viewer.component.ts`. Use the same pill pattern already in place.

## Risks / Trade-offs

- [Performance] `JobController` now queries `snapshotFileRepository` for every job in the list → N snapshot queries per `/api/jobs` call. Mitigation: the jobs list is typically small (≤ 50 active jobs) and snapshot files per job are also small. No pagination change needed.
- [Data gap] REVERT jobs completed before this change will still show `affectedPaths` mapped to `'modified'` because their snapshot data exists but the controller logic won't see `fileEvents` backfilled. This is acceptable — no data migration needed.
- [Partial revert failure] If `hardReset` partially succeeds before an exception, some file events may already have been emitted while others weren't. This is the same risk as the existing ingest pipeline and is mitigated by the existing rollback (`tx.rollback()` deletes the revert snapshot).
