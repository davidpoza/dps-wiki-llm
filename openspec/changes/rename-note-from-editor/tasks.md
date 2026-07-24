## 1. Backend — RENAME job type and service

- [x] 1.1 Add `RENAME` to `JobType` enum in `backend/src/main/java/com/dpswikillm/domain/JobType.java`
- [x] 1.2 Create `RenameJobService` in `backend/src/main/java/com/dpswikillm/services/` that accepts `(String oldRelPath, String newName)`, calls `FileService.renameFile()`, then walks the vault and rewrites Markdown links and Wikilinks in every `.md` file
- [x] 1.3 Add a `RENAME` case in `JobConsumers.java` that parses the job payload JSON and delegates to `RenameJobService`

## 2. Backend — REST endpoint

- [x] 2.1 Add `POST /api/jobs/rename?path=&newName=` to `JobController` (or a new `RenameController`) that validates path exists and target name is not taken, then calls `queueService.enqueue(JobType.RENAME, JobMode.unattended, payload)` and returns `202 EnqueueJobResponse`
- [x] 2.2 Ensure `409 Conflict` is returned when a file with `newName` already exists in the same directory (pre-flight check before enqueue)

## 3. Frontend — file service method

- [x] 3.1 Add `renameJob(path: string, newName: string): Observable<EnqueueJobResponse>` to `file.service.ts` that calls `POST /api/jobs/rename`

## 4. Frontend — confirmRename() update

- [x] 4.1 Replace the `this.fileService.renameFile(...)` call in `confirmRename()` (`explorer.component.ts`) with `this.fileService.renameJob(...)` and on success navigate to `/jobs` via `this.router.navigate(['/jobs'])`
- [x] 4.2 Keep the `409 Conflict` error toast path intact — show the existing conflict error toast and do not navigate

## 5. Frontend — pencil button in editor header

- [x] 5.1 Add a `p-button` with `icon="pi pi-pencil"`, `[text]="true"`, `size="small"`, `severity="secondary"` inside `.editor-title` in `explorer.component.ts`, rendered only when `selectedPath()` is truthy, calling `openRenameDialog()`

## 6. Verification

- [ ] 6.1 Rename a note from the file-tree context menu — confirm job appears in `/jobs` and file is renamed on disk
- [ ] 6.2 Rename a note from the editor header pencil button — confirm same job flow and redirect
- [ ] 6.3 Rename a note that is linked from another note — confirm the linking note is updated to the new path after job completes
- [ ] 6.4 Attempt to rename to a conflicting name — confirm `409` toast is shown and no navigation occurs

