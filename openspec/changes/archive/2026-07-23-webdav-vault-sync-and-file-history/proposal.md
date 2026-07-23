## Why

The vault currently lives only inside a Docker volume with no off-box replication, so there is no way to keep it in sync with an external store or to bring in changes made elsewhere. At the same time, the change-history model still speaks in "commits" — a concept inherited from the now-removed internal git — which no longer matches how changes actually happen (one file at a time). We want durable off-box replication of the vault over WebDAV plus a history model that reflects reality: per-file changes, viewable both in the history screen and directly from the editor.

## What Changes

- The vault storage remains a Docker volume, but every write now also replicates to an **external WebDAV repository** (URL, username, password configured via environment variables).
- On every local file save: write to the volume → record the change in history → **synchronously push that single file** to WebDAV. The push is scoped to the one file being saved, so it stays fast; if the WebDAV push fails, the save reports an error.
- A new **Sync button** performs a **pull + reconcile**: it fetches remote changes from WebDAV, records incoming changes as history entries, and — when a file changed both locally and remotely — opens **manual conflict resolution with a side-by-side diff** where the user picks which version of the file to preserve.
- **BREAKING**: The change-history model removes the "commit"/grouped-snapshot concept. History is now recorded and displayed **file by file**, with each entry tagging its source (local edit, background job, or WebDAV pull).
- The change-history screen renders per-file change entries (with diffs) instead of commit cards.
- The file editor gains the ability to **preview earlier versions of the open file** and see a **diff of the previewed version against the current one**, without leaving the editor.

## Capabilities

### New Capabilities
- `webdav-vault-sync`: Replication of the vault to an external WebDAV repository — synchronous per-file push on save, a manual pull + reconcile via the Sync button, and side-by-side conflict resolution when local and remote diverge.
- `file-version-preview`: Previewing an earlier version of the currently open file from inside the editor and diffing it against the current content.

### Modified Capabilities
- `snapshot-versioning`: Change history moves from grouped commit/snapshot entries to per-file change entries; each entry records the source of the change (local edit, job, WebDAV pull), and the history screen and revert operate on individual file changes.

## Impact

- **Backend (new)**: WebDAV client integration (e.g. Sardine), a `WebDavSyncService` for push/pull/reconcile, a per-file baseline (remote ETag/hash) to detect conflicts, and endpoints for the Sync button, conflict listing, and conflict resolution.
- **Backend (modified)**: `SnapshotService`/`FileService` write path (push on save + per-file history), history query/DTOs reshaped to file-by-file, an endpoint to fetch a specific prior version and its diff for the editor. New Flyway migration(s) for the file-version/baseline schema.
- **Config**: New env vars `WEBDAV_URL`, `WEBDAV_USERNAME`, `WEBDAV_PASSWORD` wired through `AppProperties`, `application.yml`, `docker-compose.yml`, and `.env.sample`.
- **Frontend**: History component reworked to file-by-file entries; a Sync button with progress/error states; a side-by-side conflict-resolution view; and editor controls to browse and preview prior versions with an inline diff.
- **Dependencies**: New WebDAV client library on the backend.
