## Why

The current conflict resolution UI only lets users choose between keeping the local or remote version, one file at a time. Users need faster bulk resolution for large syncs and richer per-conflict options: skipping a conflict for later without resolving it, or writing a custom merged version manually.

## What Changes

- **Collapsed conflict list**: each conflict entry in the dialog shows only the file path and action buttons by default; the user clicks to expand the diff panes for a specific conflict.
- Add **bulk resolution buttons** ("Aplicar versión local a todos" / "Aplicar versión remota a todos") at the top of the conflict dialog to resolve all pending conflicts with a single click.
- Add a **"No resolver"** action per conflict that dismisses the conflict from the list without writing any changes to disk or WebDAV (clears the conflict flag in the DB).
- Add a **"Resolución manual"** action per conflict that opens a dedicated three-pane merge editor component (local | remote on top, editable result pane at the bottom) modelled after VS Code's conflict resolution UI. The user composes the final content and submits it (writing to disk, pushing to WebDAV, clearing the conflict).
- Extend `POST /api/webdav/conflicts/resolve` to accept `keep: "SKIP"` and `keep: "MANUAL"` (with a `content` field for `MANUAL`).

## Capabilities

### New Capabilities

- `conflict-resolution-options`: Extended conflict resolution UI and API supporting collapsed conflict list with resolved counter, bulk resolution, skip-without-change, and VS Code-style three-pane merge editor.

### Modified Capabilities

- `webdav-vault-sync`: The `POST /api/webdav/conflicts/resolve` endpoint gains two new `keep` values (`SKIP` and `MANUAL`), and the side-by-side conflict resolution requirement gains three new resolution scenarios.

## Impact

- **Backend**: `ConflictResolveRequest` gains an optional `content` field. `WebDavSyncService.resolveConflict` handles `SKIP` (clear conflict flag, no file changes) and `MANUAL` (write custom content to disk and WebDAV).
- **Frontend**: `git-history.component.ts` gains a resolved-counter in the dialog header, collapsed-by-default conflict entries (click to expand diff), bulk-action buttons, and "No resolver"/"Resolución manual" buttons per conflict. A new `ConflictMergeEditorComponent` renders the three-pane VS Code-style editor as a full-screen dialog. `api.service.ts` gains the `content` parameter. i18n keys added to `es.json` / `en.json`.
- **No schema/DB changes** — `VaultFileSync.conflict` flag already covers the skip case.
