## 1. Configuration & dependencies

- [x] 1.1 Add the Sardine WebDAV client dependency (pinned version) to the backend build
- [x] 1.2 Add a `WebDav(url, username, password)` record to `AppProperties` with blank-safe defaults
- [x] 1.3 Wire `WEBDAV_URL` / `WEBDAV_USERNAME` / `WEBDAV_PASSWORD` in `application.yml`, `docker-compose.yml`, and `.env.sample`

## 2. Database schema

- [x] 2.1 Flyway migration: add `source` column (`LOCAL_EDIT` | `JOB` | `WEBDAV_PULL`) to the history tables with a sensible default for existing rows
- [x] 2.2 Flyway migration: create `vault_file_sync` table (`path` PK, `synced_hash`, `remote_etag`, `replicated`, `conflict`, `remote_content`, `updated_at`)
- [x] 2.3 Add JPA entities + repositories for the baseline/conflict table

## 3. WebDAV client wrapper

- [x] 3.1 Implement `WebDavClient` wrapping Sardine: `put`, `get`, `delete`, `move`, `list`/PROPFIND with ETag, and parent-collection (MKCOL) creation
- [x] 3.2 Centralize vault-relative-path → WebDAV-URL mapping (encoding, nested dirs) in `WebDavClient`
- [x] 3.3 Support a disabled/no-op mode when `WEBDAV_URL` is blank
- [x] 3.4 Unit tests for path mapping and disabled mode

## 4. Per-file history model

- [x] 4.1 Extend `SnapshotService` write path to record the change `source` on each entry
- [x] 4.2 Add a per-file history read path that returns a flat reverse-chronological stream of entries (`changeId`, `path`, `source`, `linesAdded`, `linesDeleted`, `createdAt`)
- [x] 4.3 Reshape the history DTO(s) and `GET /api/snapshots` (or new `GET /api/history`) to the per-file shape
- [x] 4.4 Provide a per-change diff endpoint (`GET /api/history/{changeId}/diff`) using the existing java-diff-utils logic
- [x] 4.5 Remove the commit-level hard-reset endpoint (`POST /api/snapshots/{id}/reset`) and confirm `JobRevertService` still works via job grouping

## 5. Synchronous push on save

- [x] 5.1 In `FileService.saveContent`, push the single saved file to WebDAV after the local write + history record; update its `vault_file_sync` baseline (hash/etag, `replicated=true`)
- [x] 5.2 On push failure, keep the local write + history, set `replicated=false`, and return an error the controller surfaces to the client
- [x] 5.3 Replicate deletes (`deleteFile`) and renames/moves (`renameFile`, `moveFile`) to WebDAV and update baselines
- [x] 5.4 Tests for save/delete/rename push paths, including the push-failure case

## 6. Sync (pull + reconcile) & conflicts

- [x] 6.1 Implement `WebDavSyncService.sync()`: PROPFIND remote, compare each file's local hash, remote content/etag, and `synced_hash` per decision D4
- [x] 6.2 Apply non-conflicting remote adds/modifies/deletes to the vault and record `WEBDAV_PULL` history entries + baseline updates
- [x] 6.3 Detect conflicts (both sides changed) and persist them (`conflict=true`, captured `remote_content`) without overwriting either side
- [x] 6.4 `POST /api/webdav/sync` returning `{pulled[], deleted[], conflicts[]}`; return "not configured" when WebDAV is disabled
- [x] 6.5 `GET /api/webdav/conflicts` returning `{path, localContent, remoteContent}` for unresolved conflicts
- [x] 6.6 `POST /api/webdav/conflicts/resolve` `{path, keep}` — keep local → push; keep remote → write local + `WEBDAV_PULL` entry; clear conflict + update baseline
- [x] 6.7 Tests for each reconcile branch (remote-only, local-only, both-changed conflict) and both resolutions

## 7. Editor version preview endpoints

- [x] 7.1 `GET /api/files/versions?path=` returning `{versionId, createdAt, source}` list for a path (newest first)
- [x] 7.2 `GET /api/files/version?path=&versionId=` returning that version's content (404 for unknown version)
- [x] 7.3 Tests for versions listing and content retrieval

## 8. Frontend — history screen

- [x] 8.1 Rework `git-history.component.ts` to render a per-file change stream (path, source badge, +/- stats, inline diff toggle); drop commit cards and the reset button
- [x] 8.2 Update `api.service.ts` and `types.ts` for the new history/diff response shapes
- [x] 8.3 Add i18n strings for the reworked history view and source labels

## 9. Frontend — sync & conflict resolution

- [x] 9.1 Add a Sync button (history view / explorer toolbar) calling `/api/webdav/sync` with loading + summary/error states
- [x] 9.2 Build a side-by-side conflict resolution view (two panes + diff) with "Keep this version" per side, calling the resolve endpoint
- [x] 9.3 Handle the "WebDAV not configured" and push-failure states in the UI
- [x] 9.4 Add i18n strings for sync/conflict UI

## 10. Frontend — editor version preview

- [x] 10.1 Add a "Versions" control to `explorer.component.ts` listing prior versions of the open file
- [x] 10.2 Preview a selected version read-only with a diff against current content
- [x] 10.3 "Restore" action that saves the previewed content through the normal save path
- [x] 10.4 Add i18n strings for the version-preview UI

## 11. Verification

- [ ] 11.1 End-to-end: edit a file → verify local write, history entry, and WebDAV replication
- [ ] 11.2 End-to-end: change a file remotely → Sync → verify pull + `WEBDAV_PULL` history entry
- [ ] 11.3 End-to-end: change a file both locally and remotely → Sync → resolve conflict both ways
- [ ] 11.4 End-to-end: preview and restore a prior version from the editor
- [x] 11.5 Update README / docs for WebDAV configuration and the new history/sync behavior
