## Why

Today WebDAV sync can only be triggered from the Changes (`/git`) page, and its progress and conflict resolution are only visible there. A user working in the Explorer, Chat, Ingest, or any other screen has to navigate away to pull remote changes, and gets no feedback while a sync runs. Sync is a cross-cutting action, so it should be reachable from anywhere, report progress in place, and surface conflicts wherever the user happens to be.

## What Changes

- Add a **sync icon in the top-right corner of the navigation bar**, present on every authenticated screen, that triggers a WebDAV sync. The icon reflects sync state (idle / in-progress) and is disabled while a sync is already running (single-flight).
- Show a **live progress toast** while the sync runs, updating in real time from the existing job event stream (percent complete and the file currently being scanned), then collapsing to a short success or error summary when the job finishes.
- When a completed sync reports conflicts, **automatically open the existing conflict-resolution dialog** (collapsed list, bulk actions, skip, and the three-pane manual merge editor) regardless of which screen the user is on — reusing the current UI unchanged.
- Extract the sync-orchestration state (enqueue → track job → load conflicts) and the conflict-resolution dialog out of `GitHistoryComponent` into an app-scoped service + shared component so both the new global control and the existing Changes page drive the **same single source of truth** (no duplicated conflict state, no double dialogs).
- Introduce a small app-scoped toast host (there is no toast/notification system today), mounted once at the app root alongside the existing global search modal and global spinner.

No backend changes: `POST /api/webdav/sync`, the `sync-scan` job progress events, `GET /api/webdav/conflicts`, and `POST /api/webdav/conflicts/resolve` already provide everything needed.

## Capabilities

### New Capabilities
- `global-sync-control`: A sync trigger reachable from any authenticated screen via a navigation-bar icon, with a real-time progress toast driven by the job event stream, terminal success/error feedback, single-flight guarding, and automatic surfacing of the existing conflict-resolution dialog when a sync reports conflicts.

### Modified Capabilities
- `app-navigation`: The navigation bar gains a persistent sync **action** (icon, top-right) shown on every authenticated page. This is an action control, distinct from the seven navigation destinations, and does not change the destination set.

## Impact

- **Frontend (Angular)**:
  - New `SyncService` (root-provided): owns `syncing`, live progress, terminal result, and conflict signals; wraps `api.enqueueSync()` and observes `JobsStore` for the enqueued job's `currentActivity` and terminal state.
  - New `SyncStatusToastComponent` (live progress + result toast) and a shared `ConflictResolverComponent` (the conflict `p-dialog` + `<app-conflict-merge-editor>`), both mounted once in `AppComponent`.
  - `NavComponent`: add the top-right sync icon button wired to `SyncService`.
  - `GitHistoryComponent`: refactor its sync button, progress, and conflict handling to delegate to the shared `SyncService`/`ConflictResolverComponent` instead of owning that state locally.
  - i18n: new `sync.*` toast strings in the Transloco `es`/`en` message files.
- **Backend**: none.
- **APIs / dependencies**: none new; reuses existing WebDAV sync + conflict endpoints, the `JobsStore` SSE stream, and PrimeNG (already a dependency).
