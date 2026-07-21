## Context

The editor view (`document-viewer.component.ts`) has a topbar with action buttons (theme toggle, Home). The `FileService` frontend service already exposes `deleteFile(path)` which calls `DELETE /api/files/content?path=...`. The `explorer.component.ts` already uses PrimeNG's `ConfirmationService` + `ConfirmDialogModule` for the same confirmation pattern — we should follow that convention rather than inventing a new one.

## Goals / Non-Goals

**Goals:**
- Add a Delete button in the `document-viewer` topbar
- Show a PrimeNG `<p-confirmdialog>` before deleting, naming the file
- On confirm: call `FileService.deleteFile()`, navigate home on success, show toast on error
- On cancel: close dialog, no action

**Non-Goals:**
- Bulk file deletion
- Trash/undo support (file is hard-deleted via existing backend)
- Changing the backend API (already exists)
- Adding delete to the explorer context menu (already exists there)

## Decisions

### Use PrimeNG ConfirmationService (not a custom dialog)
The `ConfirmationService` + `ConfirmDialogModule` pattern is already established in `explorer.component.ts`. Using it keeps the UX consistent and avoids a new dependency.
- Alternative: `window.confirm()` — simpler but bypasses the app's theme and i18n system.

### Navigate to home after deletion
After a successful delete the file no longer exists, so the editor URL becomes invalid. Routing to `/` (home/explorer) is the safest and most intuitive destination.
- Alternative: Navigate to the previous route — more complex and could route to a now-broken URL.

### Add `ConfirmationService` and `MessageService` as local providers on the component
`document-viewer` is a standalone component; `ConfirmationService` must be provided at the component level (or a parent) for `<p-confirmdialog>` to resolve correctly — same as in `explorer.component.ts`.

## Risks / Trade-offs

- [Risk] Delete button visible in read-only or anonymous contexts → Mitigation: only render the button when the user is authenticated; the `AuthService` signal is already available in the component.
- [Risk] Backend may return an error (e.g., file already deleted by WebDAV sync) → Mitigation: subscribe to the delete observable and show a `p-toast` error message on failure.
