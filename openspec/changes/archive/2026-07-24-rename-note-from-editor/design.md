## Context

Rename is currently synchronous: `POST /api/files/rename` moves the file on disk, pushes the change to WebDAV, and returns 200 in-band. Links to the renamed file are never fixed, leaving stale references across the vault. The editor header has no rename affordance — users must go to the file tree to trigger it.

The job system (`JobConsumers`, `JobQueueService`, `JobType`) already handles other async vault-mutating operations (INGEST, ENRICH, REGENERATE_KEYWORDS). RENAME fits the same pattern.

## Goals / Non-Goals

**Goals:**
- Expose rename from the editor header (pencil button next to filename).
- Convert rename to an async RENAME job that also rewrites all inbound vault links.
- Both entry points (p-tree and editor header) share one dialog and one job endpoint.
- After confirming, navigate to `/jobs`.

**Non-Goals:**
- Renaming directories.
- Fixing links in non-`.md` files.
- Keeping the old synchronous endpoint alive (it can be removed or left as-is; the UI will no longer call it).
- Undo/revert of the rename (existing REVERT job handles job-level revert if needed).

## Decisions

### 1 — RENAME as a job (not synchronous)

**Decision:** Enqueue a `RENAME` job via `POST /api/jobs/rename?path=&newName=` (202 Accepted) rather than calling the existing synchronous endpoint.

**Rationale:** Link rewriting requires scanning the entire vault, which can take seconds on large repos. Blocking the UI thread for that is bad UX. The existing job infrastructure (RabbitMQ, SSE progress, `/jobs` page) is the natural home for vault-mutating long-running tasks.

**Alternative considered:** Do the rename synchronously and fix links in a background thread. Rejected — it splits success/failure reporting across two paths and the user sees partial results.

### 2 — Link rewriting strategy

**Decision:** `RenameJobService` opens every `.md` file under the vault root, replaces:
- Markdown links: `[text](old-path)` → `[text](new-path)` (exact filename match, case-sensitive)
- Wikilinks: `[[OldName]]` and `[[OldName|alias]]` → `[[NewName]]` / `[[NewName|alias]]` (stem match, i.e., filename without `.md`)

Use Java `Files.walk` + `String.replace` / regex on raw text. No Markdown AST parsing needed — string matching on the raw `.md` content is sufficient and safe for the link formats in use.

**Alternative considered:** Parse Markdown AST for precision. Rejected — overkill for link rewriting; would add a new Java Markdown parser dependency.

### 3 — Frontend entry point: pencil in editor-header

**Decision:** Add a small `p-button` with `icon="pi pi-pencil"` and `[text]="true"` inside `.editor-header` > `.editor-title`, after the filename span, calling `openRenameDialog()`. Reuse the same dialog already rendered in `explorer.component.ts`.

**Rationale:** `openRenameDialog()` already reads the current `selectedNode` from the tree. Since the editor always reflects `selectedPath()`, the node is always set when the editor has a file open. No new dialog component needed.

### 4 — confirmRename() calls job endpoint, then navigates to /jobs

**Decision:** Replace `this.fileService.renameFile(...).subscribe(...)` in `confirmRename()` with `this.fileService.renameJob(path, newName).subscribe(() => this.router.navigate(['/jobs']))`. On HTTP error (400/409) show the existing error toast and stay on current page.

**Rationale:** 409 conflict (file already exists) can still be detected synchronously from the enqueue endpoint before the job starts, so we keep that UX intact. All other outcomes are tracked on `/jobs`.

## Risks / Trade-offs

- **Partial link rewrite on failure**: If the job fails mid-scan (disk error, OOM), some files may have been rewritten and some not. Mitigation: perform the file move first; if it succeeds, attempt all link rewrites and log each failure without aborting — the vault remains consistent (renamed file exists, some links may lag).
- **Concurrent jobs on the same file**: A RENAME job and an ENRICH job running on the same file at the same time could conflict. Mitigation: the existing write-queue `prefetch=1` serialises all write jobs, so this is already handled by the architecture.
- **Editor shows stale path after rename**: After navigating to `/jobs`, the editor is no longer open, so stale `selectedPath` is moot. On return, the user will navigate to the new path.

## Migration Plan

1. Add `RENAME` to `JobType` enum.
2. Implement `RenameJobService` (file move + link rewrite).
3. Add `RENAME` case in `JobConsumers`.
4. Add `POST /api/jobs/rename` endpoint.
5. Update `confirmRename()` in `explorer.component.ts`.
6. Add pencil button in editor header.
7. Update i18n strings if needed.

No database migrations. No WebDAV config changes. Rollback: revert the `JobType` enum addition and the frontend change — the old synchronous endpoint stays untouched during this change.
