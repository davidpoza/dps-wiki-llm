## Context

Every state-mutating job stores a **snapshot** (`snapshots` + `snapshot_files`). Each `SnapshotFile` keeps `contentBefore` (the file's content prior to the job) and `contentAfter` (content after). `JobController.buildFileEvents` derives the per-file action shown in the jobs panel directly from this data: `action = "delete"` when `contentAfter == null`, otherwise `"update"`. So a **DELETE** chip is, by construction, a snapshot-file whose `contentBefore` is non-null and `contentAfter` is null — meaning the pre-deletion content is already persisted and available.

Today the only way to undo a deletion is `POST /api/jobs/{id}/revert` (`JobRevertService`), which hard-resets the job's *entire* snapshot and marks the job `REVERTED`. That is all-or-nothing. There is precedent for a lighter path: `FileService.saveContent` performs a single-file write that captures its own `LOCAL_EDIT` snapshot, reindexes, and pushes to WebDAV — outside the job/queue machinery — and is reversible through the file-versions history.

## Goals / Non-Goals

**Goals:**
- Recover one deleted file from a job's snapshot with its exact pre-deletion content.
- Leave the rest of the job (and its snapshot/status) untouched.
- Make the recovery itself durable, indexed, replicated to WebDAV, and reversible via the existing file-versions history.
- Surface the action exactly where the deletion is shown: next to the DELETE chip in the jobs viewer.

**Non-Goals:**
- Bulk / multi-file recovery or "recover all deletions in this job".
- Changing the target job's status (it stays `COMPLETED`/`REVERTED`; the DELETE chip remains as historical record).
- Recovering non-deletion entries or restoring a file to an arbitrary older version (that is the file-versions feature).
- Undoing remote pushes beyond the WebDAV replication that a normal single-file write already performs.

## Decisions

### Decision 1: Synchronous single-file write, not a new job type

Recovery is implemented as a synchronous controller endpoint that recreates one file, mirroring `FileService.saveContent`, rather than as a new `RECOVER_FILE` `JobType` dispatched through the write queue.

- **Why:** The operation is a single small write whose reversibility and history are already covered by the snapshot/versioning system. `saveContent` (manual editor save) sets the precedent for synchronous, snapshot-backed, non-queued single-file mutations.
- **Alternative considered:** A dedicated `RECOVER_FILE` job (new enum value, `JobConsumers` dispatch, handler, revert conflict logic like `JobRevertService`). Rejected as disproportionate — it adds queue latency and a job card for what is effectively one file write, without added safety over the snapshot the write already captures.
- **Trade-off:** Like `saveContent`, this bypasses the write-queue serialization. Acceptable because it carries no more risk than a manual save, and the existence guard (Decision 4) prevents clobbering.

### Decision 2: Content source is the target job's snapshot `contentBefore`

The endpoint takes the job id in the path and the file path as a parameter. It loads the job's `snapshotId`, then finds the `SnapshotFile` for the normalized path where `contentAfter == null` and `contentBefore != null`, and uses that `contentBefore` as the content to write.

- **Why:** This is the *same* data that produced the DELETE chip, so any file shown as DELETE is guaranteed to have recoverable content. No separate storage or lookup path is introduced.
- **Path normalization** reuses `VaultPathResolver.normalizeRelativePath` (as `SnapshotService` already does) so the lookup matches how snapshot paths are stored.

### Decision 3: Recreate via a snapshot-backed `FileService` write that creates parent dirs

Add a `FileService` method (e.g. `recoverDeletedFile(path, content)`) that: creates missing parent directories, begins a snapshot (source e.g. `RECOVERY`), captures-before (absent file → recorded as new), writes the content, records-after, finalizes the snapshot, reindexes, and pushes to WebDAV — the same sequence as `saveContent` plus `Files.createDirectories` for the parent (a deleted file's directory may have been pruned, as `SnapshotService.hardReset` accounts for).

- **Why not reuse `saveContent` directly:** `saveContent` does not create parent directories, so recovering into a pruned folder would fail. A dedicated method keeps the behavior explicit and lets history tag the source as a recovery.

### Decision 4: Reject when the target already exists (409 Conflict)

If a file already exists at the target path, the endpoint returns a conflict and does not write.

- **Why:** The action is only meaningful when the file is currently absent. A DELETE chip is historical; the file may have been recreated later by another change. Overwriting current content would be surprising and data-losing. Rejecting is the least-surprise behavior; the snapshot/versions feature remains the tool for content divergence.

### Decision 5: Endpoint shape and frontend feedback

- **Endpoint:** `POST /api/jobs/{id}/files/recover` with `@RequestParam("path")`, matching the existing `enqueueEnrich`/`enqueueRename` convention that pass `path` as a request parameter.
- **Frontend:** In `jobs-viewer.component.ts`, render a small RECOVER button inside each `.file-entry` guarded by `f.action === 'delete'`. The handler calls `api.recoverDeletedFile(jobId, path)`. Track successfully recovered `${jobId}|${path}` keys in a local `signal(new Set())`; the template swaps the button for a "recovered" indicator for those keys. Failures are surfaced (consistent with the existing `console.error` handlers for revert/cancel/abandon). The target job's DELETE chip is intentionally left in place as a historical record.

## Risks / Trade-offs

- **Recovering a RENAME's old-path deletion recreates a duplicate of the moved file.** → Accepted: the user explicitly chooses to recover a specific path; the behavior (recreate the pre-deletion content) is literal and predictable. Not special-cased.
- **Bypasses write-queue serialization.** → Same risk profile as `saveContent`; the existence guard prevents overwriting a concurrently-recreated file.
- **Stale jobs-viewer state after recovery** (the DELETE chip stays). → Intentional; the recovered-state indicator communicates success without rewriting history. A later full refresh still shows the historical DELETE chip.
- **Content divergence** (file was recreated with different content, then deleted again by a different job). → The existence guard blocks recovery while it exists; once absent, recovery restores the content from the *selected* job's snapshot, which is the content the user is looking at.

## Migration Plan

Additive only — no data migration. New endpoint + new frontend button + two i18n keys. Rollback is removing the endpoint and button; existing snapshots are unaffected.

## Open Questions

- None blocking. Error surfacing on the frontend follows the existing `console.error` pattern; upgrading to a user-visible toast can be a follow-up if a toast system is later standardized.
