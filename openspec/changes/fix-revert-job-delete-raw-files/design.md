## Context

`IngestPipelineService.run()` creates a snapshot that tracks wiki notes and `INDEX.md`. The raw input file (written by `RawIntakeService` to `raw/inbox/` or `raw/web/` before the job is queued) is intentionally read-only during the pipeline and is never captured in the snapshot. When `JobRevertService` calls `SnapshotService.hardReset()`, it only restores files that were captured in the snapshot, so the raw file is left untouched.

`SnapshotService.hardReset()` already handles file deletion: if a `SnapshotFile` record has `contentBefore == null` it calls `Files.deleteIfExists()` on that path. The mechanism exists; it just needs to be wired to the raw file.

## Goals / Non-Goals

**Goals:**
- Raw files are deleted when their ingest job is reverted.
- The revert snapshot accurately records the raw file deletion (`contentBefore = content`, `contentAfter = null`).
- No change to the public `hardReset` logic or the revert flow itself.

**Non-Goals:**
- Retroactively cleaning up raw files from jobs ingested before this fix.
- Modifying the `RawIntakeService` or the job-queueing flow.

## Decisions

### D1 — Treat the raw file as "created by the ingest job" in the snapshot

**Decision:** Add `SnapshotService.captureFileAsNew(Snapshot, String)` which saves a `SnapshotFile` with `contentBefore = null`, regardless of whether the file exists on disk.  
Call it in `IngestPipelineService.run()` after `normalize()` resolves `payload.rawPath()`, and call `recordAfter(snapshot, payload.rawPath())` at the end of both pipeline branches.

**Rationale:** The raw file is conceptually "born" as part of the ingest request. Marking it as new (`contentBefore = null`) causes `hardReset` to delete it during revert, which is exactly the desired semantics — no additional code path in `JobRevertService` is needed.

**Alternative considered:** Explicitly delete `target.getPayloadRef()` inside `JobRevertService.revert()` when the target type is `INGEST`. Rejected because it bypasses the snapshot contract, the deletion is not tracked in the revert snapshot, and it requires `JobRevertService` to know about the raw-file concept.

### D2 — Add raw path to `affectedPaths`

**Decision:** Include `payload.rawPath()` in `allPaths` (unattended) and `baselinePaths` (validated / `AWAITING_REVIEW`).

**Rationale:** `affectedPaths` is used by the conflict-detection logic in `JobRevertService`. If a later job also touched the raw path (unlikely but possible), the conflict guard should prevent the revert, consistent with how wiki-note conflicts are handled.

## Risks / Trade-offs

- **Existing jobs** ingested before this fix will not have the raw path in their snapshot. Their revert will not delete the raw file. This is acceptable; no regression in existing behaviour.
- **`captureFileAsNew` is a narrow helper** that bypasses the usual "read current content" logic. Any caller that misuses it on a file that should be restored rather than deleted would cause data loss. The method name and this design note make the intent clear.

## Migration Plan

No schema changes. Deploy the updated backend; new ingest jobs immediately track the raw file. Old jobs are unaffected.
