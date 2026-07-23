## Why

The file navigator panel only supports clicking to open files — there is no way to manage files (rename, delete, create) without leaving the UI or using external tools. Adding a right-click context menu enables basic file management directly from the explorer.

## What Changes

- Right-clicking a **file** node in the tree shows a context menu with: **Rename file**, **Delete file**.
- Right-clicking a **directory** node in the tree shows a context menu with: **Create file**.
- New backend endpoints: delete a file, rename/move a file, create a new empty file.
- Frontend `FileService` gains three new methods: `deleteFile`, `renameFile`, `createFile`.

## Capabilities

### New Capabilities

- `file-tree-context-menu`: Right-click context menu on tree nodes — shows file actions (rename, delete) or directory actions (create file); delegates to backend file management endpoints.
- `file-management-api`: Backend REST endpoints for deleting, renaming, and creating files within the wiki directory.

### Modified Capabilities

(none — existing read/save flow is unchanged)

## Impact

- **Frontend**: `ExplorerComponent` gains contextmenu event handling, a custom overlay/menu, and dialog prompts for rename and create-file. `FileService` gains three HTTP methods.
- **Backend**: `FileController` gains `DELETE /files/content`, `POST /files/rename`, and `POST /files/content`. `FileService` (Java) gains matching methods with path-traversal guards.
- **No breaking changes** to existing endpoints.
