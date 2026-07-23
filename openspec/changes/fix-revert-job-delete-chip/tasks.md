## 1. Backend — expose snapshot files metadata

- [x] 1.1 Add `getSnapshotFiles(UUID snapshotId)` public method to `SnapshotService` returning `List<SnapshotFile>` (wraps existing `snapshotFileRepository.findBySnapshotId`)

## 2. Backend — emit file events during revert

- [x] 2.1 In `JobRevertService.revert()`, before calling `hardReset`, call `snapshotService.getSnapshotFiles(targetSnapshotId)` and store the result in a local variable
- [x] 2.2 After `hardReset` succeeds, loop through the stored snapshot files and call `lifecycleService.fileEvent(revertJob, sf.getPath(), action)` where `action = "delete"` if `sf.getContentBefore() == null`, else `"update"`

## 3. Backend — add `fileEvents` to REST job summary

- [x] 3.1 Create `FileEventDto` record in `com.dpswikillm.dto` with fields `String path` and `String action`
- [x] 3.2 Add `List<FileEventDto> fileEvents` field to `JobSummary` record
- [x] 3.3 In `JobController`, when building the jobs list, for each job with a non-null `snapshotId` look up snapshot files via `snapshotService.getSnapshotFiles(job.getSnapshotId())` and map to `FileEventDto` list (`contentAfter == null` → `"delete"`, else → `"update"`); set `fileEvents = List.of()` for jobs without a snapshot

## 4. Frontend — update API types and store

- [x] 4.1 In `api.service.ts`, add `fileEvents?: { path: string; action: string }[]` to the `JobSummary` interface
- [x] 4.2 In `jobs.store.ts` `mergeHistory()`, replace the hardcoded `'modified'` mapping: if `j.fileEvents` is non-empty use those; otherwise fall back to mapping `affectedPaths` with `'modified'`

## 5. Frontend — add DELETE chip styling

- [x] 5.1 In `jobs-viewer.component.ts` styles, add `.action-delete { background: #ef4444; }` alongside the existing `.action-create`, `.action-update`, etc.

## 6. Verification

- [x] 6.1 Run backend tests (`mvn test`) and confirm no regressions in `JobRevertServiceTests` and `SnapshotServiceTests`
- [x] 6.2 Manually trigger an INGEST job, then revert it, and verify the revert job card shows DELETE chips for created files and UPDATE chips for modified files in the live view
- [x] 6.3 Reload the page after the revert completes and verify the historical REVERT job card still shows correct DELETE / UPDATE chips (from REST data)
