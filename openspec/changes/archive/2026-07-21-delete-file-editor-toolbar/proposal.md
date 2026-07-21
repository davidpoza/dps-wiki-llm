## Why

Users working in the editor have no quick way to delete the current file without navigating away. Adding a delete button in the editor toolbar allows them to remove files in one action while staying in context, with a confirmation dialog to prevent accidental deletions.

## What Changes

- Add a **Delete** button to the editor toolbar
- Clicking it opens a confirmation dialog showing the file name
- Confirming triggers deletion of the file via the existing backend API and navigates the user away from the deleted file
- Cancelling leaves the editor open with no changes

## Capabilities

### New Capabilities

- `editor-delete-file`: Toolbar button + confirmation dialog that deletes the currently open file

### Modified Capabilities

<!-- No existing spec-level requirements are changing -->

## Impact

- **Frontend**: Editor toolbar component gains a delete button; new confirmation dialog component (or reuse of existing dialog pattern); routing logic to navigate away after deletion
- **Backend**: No changes needed — the delete file API endpoint is already in use elsewhere
- **APIs**: Reuses existing `DELETE /api/files/{id}` (or equivalent) endpoint
