## 1. SnapshotService — add captureFileAsNew

- [x] 1.1 Add `captureFileAsNew(Snapshot snapshot, String relPath)` to `SnapshotService` — saves a `SnapshotFile` with `contentBefore = null` (skips reading disk), so `hardReset` will delete the file on revert

## 2. IngestPipelineService — track raw file in snapshot

- [x] 2.1 After `sourceNormalizer.normalize()` resolves `payload`, call `snapshotService.captureFileAsNew(snapshot, payload.rawPath())`
- [x] 2.2 In the **unattended** branch: add `payload.rawPath()` to `allPaths` and call `snapshotService.recordAfter(snapshot, payload.rawPath())` before `finalizeSnapshot`
- [x] 2.3 In the **validated / AWAITING_REVIEW** branch: add `payload.rawPath()` to `baselinePaths` and call `snapshotService.recordAfter(snapshot, payload.rawPath())` before the early return

## 3. Tests

- [x] 3.1 In `JobRevertServiceTests`: add a test `revertIngestJobDeletesRawFile` — set up an ingest snapshot that includes a `raw/inbox/` file captured with `contentBefore = null`, verify the file is deleted after revert
- [x] 3.2 In `IngestPipelineServicesTests` (or `SnapshotServiceTests`): verify that after a pipeline run the snapshot contains the raw path entry with `contentBefore = null`
