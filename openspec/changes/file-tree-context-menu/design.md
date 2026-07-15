## Context

The explorer is an Angular 19 standalone component (`ExplorerComponent`) that renders a PrimeNG `p-tree` for file navigation. The backend is Spring Boot with a `FileController` that currently exposes `GET /files/tree`, `GET /files/content`, and `PUT /files/content`. No file-management operations (delete, rename, create) exist yet.

## Goals / Non-Goals

**Goals:**
- Right-click on any tree node opens a context menu with node-type-appropriate actions.
- File actions: rename (inline dialog) and delete (confirmation dialog).
- Directory action: create a new `.md` file (name entered via dialog).
- Backend enforces path-traversal guards on all three new endpoints.
- After any mutation the tree is refreshed automatically.

**Non-Goals:**
- Move/drag-and-drop file reorganisation.
- Directory rename or delete.
- Creating subdirectories.
- Undo/redo for destructive operations.

## Decisions

### 1. Use PrimeNG ContextMenu + Tree integration

PrimeNG's `p-tree` supports a `[contextMenu]` binding that links it to a `p-contextMenu`. On right-click the tree emits `(onContextMenuSelect)` with the clicked node; the component updates menu items dynamically based on node type before the menu appears.

**Alternative considered**: Custom floating div positioned at `event.clientX/Y`. Rejected: more code, reinvents accessibility and dismiss behavior already provided by PrimeNG.

### 2. Backend endpoints

| Operation | Method | Path | Body |
|-----------|--------|------|------|
| Delete file | `DELETE` | `/files/content?path=…` | — |
| Rename file | `POST` | `/files/rename?path=…&newName=…` | — |
| Create file | `POST` | `/files/content?path=…` | — |

Rename takes `newName` (filename only, no path separator) to keep the file in its current directory. The backend constructs the new absolute path and validates both old and new paths stay within the wiki root.

**Alternative**: a single `PATCH /files` endpoint with a JSON body discriminated by `op` field. Rejected: more complex than needed; separate endpoints are simpler to test and document.

### 3. Rename uses filename only (not full path)

The rename dialog asks for a new filename, not a full path. This avoids the complexity of moving files across directories and keeps the action semantically clear.

### 4. Refresh strategy after mutation

After each mutation (`delete`, `rename`, `create`) the frontend calls `fileService.getTree()` again to refresh the signal. If the currently open file was deleted or renamed, the editor is reset to empty state.

## Risks / Trade-offs

- [Context menu flickers on slow networks] → After triggering an action, the tree reload may briefly show stale state. Mitigation: optimistic local removal/rename before the API responds, with rollback on error.
- [Name collision on rename/create] → Backend returns `409 Conflict` if target path already exists; frontend shows a toast error.
- [Path traversal] → Backend guards: resolve absolute path and assert it starts with `wikiRoot`. Return `400 Bad Request` for violations.

## Migration Plan

1. Add three new endpoints to `FileController` and `FileService` (Java). No changes to existing endpoints.
2. Add `ContextMenuModule` import to `ExplorerComponent`, wire `p-contextMenu`.
3. Add `deleteFile`, `renameFile`, `createFile` to Angular `FileService`.
4. Deploy backend first (endpoints are additive); frontend change is backwards compatible.

## Open Questions

- Should creating a file inside a collapsed directory expand it automatically? (Assume yes for usability.)
- Should deleted files be moved to a trash/archive or permanently removed? (Assume permanent for now, guarded by a confirmation dialog.)
