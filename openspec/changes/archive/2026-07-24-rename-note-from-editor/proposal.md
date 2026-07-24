## Why

Renaming a note currently requires right-clicking in the file tree, and it silently moves the file without fixing any inbound Markdown links — leaving broken references scattered across the vault. Exposing rename directly from the editor header and converting it to an async job unifies the two entry points and guarantees link integrity.

## What Changes

- Add a pencil icon button next to the filename in the editor/document-viewer header that opens the existing rename dialog.
- Both the p-tree rename and the editor-header rename now enqueue a `RENAME` job (202 Accepted) instead of calling the synchronous rename endpoint directly.
- The `RENAME` job: renames the file on disk, then scans every `.md` file in the vault and rewrites any Markdown link or Wikilink that referenced the old path to the new path.
- A new `JobType.RENAME` is added to the backend enum.
- After confirming the rename dialog (from either entry point), the frontend navigates to `/jobs`.
- The old synchronous `POST /api/files/rename` endpoint is replaced (or supplemented) by `POST /api/jobs/rename` that returns `EnqueueJobResponse`.

## Capabilities

### New Capabilities
- `rename-note-job`: Backend async RENAME job — renames the file and rewrites all inbound Markdown/Wikilinks vault-wide; exposes `POST /api/jobs/rename?path=&newName=` returning 202.

### Modified Capabilities
- `document-viewer-header`: Add pencil icon button next to the filename that triggers the rename dialog (same dialog already used by file-tree-context-menu).
- `file-tree-context-menu`: After rename dialog confirmation, enqueue the RENAME job and navigate to `/jobs` instead of showing a success toast and refreshing the tree synchronously.

## Impact

- **Backend**: New `JobType.RENAME`, new `RenameJobService` (or handler in existing job consumer), new `POST /api/jobs/rename` endpoint in `JobController` or a new `RenameController`. Existing `FileService.renameFile` is reused internally.
- **Frontend**: `explorer.component.ts` — `confirmRename()` calls the new job endpoint and navigates to `/jobs`; editor header template gets a pencil `p-button` that calls `openRenameDialog()`.
- **No new dependencies** — link rewriting uses plain Java file I/O + regex/string replacement over the vault directory.
