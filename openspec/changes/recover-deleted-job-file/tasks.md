## 1. Backend — recover from snapshot

- [x] 1.1 Add `FileService.recoverDeletedFile(String relativePath, String content)`: create missing parent directories, then reuse the `saveContent` snapshot sequence (begin snapshot with source `RECOVERY`, capture-before, `Files.writeString`, record-after, finalize), then `documentIndexService.indexFile(path)` and `webDavSyncService.pushSaved(path, content)`.
- [x] 1.2 Add a lookup that, given a job's `snapshotId` and a path, returns the deleted `SnapshotFile` (normalized path match where `contentAfter == null` and `contentBefore != null`) — e.g. a `SnapshotService.findDeletedContent(UUID snapshotId, String path)` returning the `contentBefore`, or throwing when absent.
- [x] 1.3 Add `POST /api/jobs/{id}/files/recover` to `JobController` taking `@RequestParam("path")`: load job + `snapshotId` (400/404 when missing), resolve the deleted content via 1.2, reject with `409 CONFLICT` when the path already exists in the vault, otherwise call `FileService.recoverDeletedFile` and return success.
- [x] 1.4 Map the not-recoverable case (no snapshot / not a deletion) to a clear `4xx` and the existing-path case to `409`, consistent with how `enqueueRename` maps `NoSuchFileException`/`FileAlreadyExistsException`.

## 2. Frontend — API + jobs viewer

- [x] 2.1 Add `recoverDeletedFile(jobId: string, path: string): Observable<void>` to `api.service.ts` calling `POST /api/jobs/${jobId}/files/recover` with `path` as a request param.
- [x] 2.2 In `jobs-viewer.component.ts`, add a `recovered = signal(new Set<string>())` keyed by `${jobId}|${path}`, plus `recoverKey(jobId, path)` and `isRecovered(jobId, path)` helpers.
- [x] 2.3 In the `.file-entry` template, when `f.action === 'delete'` and not yet recovered, render a small RECOVER button (`jobs.recover`) that calls `recover(job.id, f.path)`; when recovered, render a "recovered" indicator (`jobs.recovered`) instead.
- [x] 2.4 Implement `recover(jobId, path)`: call `api.recoverDeletedFile`, on success add the key to `recovered`, on error `console.error` (consistent with existing revert/cancel/abandon handlers).
- [x] 2.5 Add minimal styling for the RECOVER button and recovered indicator that fits the existing `.file-entry` row.

## 3. i18n

- [x] 3.1 Add `jobs.recover` and `jobs.recovered` to `frontend/src/assets/i18n/en.json` ("Recover" / "Recovered").
- [x] 3.2 Add `jobs.recover` and `jobs.recovered` to `frontend/src/assets/i18n/es.json` ("Recuperar" / "Recuperado").

## 4. Tests

- [x] 4.1 Backend: test that recovering a deleted path recreates it with the snapshot `contentBefore`, reindexes/pushes, and leaves the job's other snapshot files untouched.
- [x] 4.2 Backend: test rejection when the path is not a deletion in the job's snapshot, and `409` when the target path already exists.
- [x] 4.3 Frontend: test that the RECOVER button renders only for `delete` entries and that a successful call swaps it for the recovered indicator without affecting other entries.

## 5. Verify

- [x] 5.1 `mvn -q -DskipTests=false test` for the touched backend modules and `npm test` for the frontend pass.
- [ ] 5.2 Manual check: delete a file via a job, click RECOVER on its DELETE chip in the jobs viewer, confirm the file reappears in the explorer with its prior content and the rest of the job is unchanged.
