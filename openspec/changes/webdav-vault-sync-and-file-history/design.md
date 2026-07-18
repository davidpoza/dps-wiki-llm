## Context

The vault is a directory mounted into the backend container (`VAULT_PATH`, default `/vault`; bind-mounted from the repo in `docker-compose.yml`). File CRUD goes through `FileService` + `VaultPathResolver`, and every write already funnels through `SnapshotService`, which stores `content_before`/`content_after` per file in the `snapshot_files` table grouped under a `snapshots` row (Flyway `V13`/`V14`, `jobs.snapshot_id` in `V15`). The history screen (`git-history.component.ts`, `GET /api/snapshots`) renders these snapshots as commit cards with per-file diffs and a "revert to" (hard reset) button. Git was already removed from the runtime by the prior `replace-git-with-db-versioning` change.

This change adds off-box replication over WebDAV and reshapes the history from commit-grouped snapshots to a per-file change stream that is also reachable from the editor. Two behaviours are locked from clarification:
- **Push is synchronous and scoped to the single file being saved** (not a full-vault sync).
- **The Sync button does pull + reconcile**; conflicts are resolved manually by choosing which whole file to keep.

## Goals / Non-Goals

**Goals:**
- Replicate every local write (create/modify/delete/rename) to an external WebDAV repository synchronously, per file, on save.
- Provide a manual Sync that pulls remote changes, records them as history entries, and surfaces conflicts for side-by-side manual resolution.
- Reshape change history to per-file entries tagged with their source (local edit, job, WebDAV pull); remove the commit/hard-reset concept.
- Let the editor list, preview, and diff prior versions of the open file, and restore one via a normal save.

**Non-Goals:**
- Line-level / three-way merge of conflicts. Resolution is whole-file "keep local" or "keep remote".
- Background/async replication queues or automatic periodic sync. Push is synchronous; pull is user-triggered.
- Real-time collaboration or locking across clients.
- Migrating or backfilling existing `snapshots` rows into the new shape beyond what the reshaped read path needs.

## Decisions

### D1: WebDAV client — Sardine
Use the `com.github.lookfirst:sardine` WebDAV client. It is the de-facto Java WebDAV library, supports PUT/GET/DELETE/MOVE/PROPFIND and ETag retrieval, and maps cleanly onto our per-file operations. Wrap it behind a `WebDavClient` component so credentials from `AppProperties` are injected once and the rest of the code stays library-agnostic.
- *Alternative considered*: hand-rolled `HttpClient` requests — rejected; PROPFIND/XML parsing and MOVE semantics are non-trivial to get right.

### D2: Config via `AppProperties.WebDav`
Add a `WebDav(String url, String username, String password)` record to `AppProperties`, wired from `WEBDAV_URL` / `WEBDAV_USERNAME` / `WEBDAV_PASSWORD` in `application.yml`, `docker-compose.yml`, and `.env.sample`. When `url` is blank, a `WebDavClient` no-op/disabled mode is used so local editing keeps working and the Sync endpoint returns a "not configured" response.

### D3: Push happens in `FileService`, synchronously, after the local write
`saveContent`, `deleteFile`, `renameFile`, `moveFile` write locally + record history first, then call `WebDavClient.put/delete/move` for that single path. On push failure the local write and history entry are kept, the file is flagged `replicated = false` on its baseline row, and the controller returns an error status so the UI can tell the user "saved locally, not replicated". Retry is implicit: the next save of that file (or resolving it via Sync) re-pushes. This honours the synchronous choice without a background queue.
- *Alternative considered*: roll back the local write on push failure — rejected; it would discard the user's edit.

### D4: Per-file baseline table for conflict detection
Add a `vault_file_sync` table: `path` (PK), `synced_hash` (SHA-256 of the content last known to match remote), `remote_etag` (nullable), `replicated` (boolean), `updated_at`. On a successful push or pull, the row is upserted with the new hash/etag. During Sync, for each file we compare three things — local content hash, remote content (via GET/ETag), and `synced_hash`:
- local == baseline, remote != baseline → remote-only change → apply.
- local != baseline, remote == baseline → local-only (already pushed) → no-op.
- local != baseline, remote != baseline, and local != remote → **conflict**.
Storing a hash rather than full content keeps the baseline small; full prior content already lives in the history store for diffing.

### D5: Reuse the existing snapshot store as the per-file history, add a `source` column
Rather than a parallel table, treat each `snapshot_files` row as a per-file change entry and add a `source` column (`LOCAL_EDIT` | `JOB` | `WEBDAV_PULL`) — carried on `snapshots` or `snapshot_files` via a new Flyway migration. Jobs keep creating a grouping row (so existing job revert via `JobRevertService` stays intact), but the **history read path** flattens rows into a reverse-chronological per-file stream. This minimizes churn to the write/revert code while satisfying the file-by-file requirement.
- *Alternative considered*: a brand-new `file_versions` table replacing snapshots — rejected as a larger, riskier refactor that would break job revert.

### D6: History & preview endpoints
- Reshape `GET /api/snapshots` (or add `GET /api/history`) to return flat per-file entries `{ changeId, path, source, linesAdded, linesDeleted, createdAt }`; diff stays at `GET /api/history/{changeId}/diff`.
- Editor preview: `GET /api/files/versions?path=` (list of `{versionId, createdAt, source}` derived from that path's change entries) and `GET /api/files/version?path=&versionId=` (that version's `content_after`). Diff previewed-vs-current is computed with the existing `java-diff-utils` already used by `SnapshotService`.
- Remove the `POST /api/snapshots/{id}/reset` hard-reset endpoint and the history "revert to" button; restore is "load previewed content → normal save".

### D7: Sync/conflict endpoints
`POST /api/webdav/sync` runs pull+reconcile and returns a summary `{pulled[], deleted[], conflicts[]}`. `GET /api/webdav/conflicts` returns `{path, localContent, remoteContent}` for unresolved conflicts; `POST /api/webdav/conflicts/resolve` `{path, keep}` applies the choice (keep local → push; keep remote → write local + `WEBDAV_PULL` history) and updates the baseline. Conflicts are held in the `vault_file_sync` row (a `conflict` flag + captured remote content) so they survive until resolved.

### D8: Frontend
- `git-history.component.ts` → per-file entry list (drop commit cards and the reset button); each entry shows path, source badge, +/- stats, and an inline diff toggle (reuse existing diff rendering).
- A **Sync** button (in the history view or explorer toolbar) calls `/api/webdav/sync`, shows progress/summary, and routes conflicts to a **side-by-side conflict view** (two panes + diff) with "Keep this version" on each side.
- `explorer.component.ts` editor gains a "History/Versions" control: lists prior versions, previews a selected one read-only with a diff vs current, and a "Restore" action that saves it.

## Risks / Trade-offs

- **Synchronous push adds latency to every save** → scoped to one file (small payload); acceptable. If WebDAV is slow/down the save still persists locally and reports the replication error rather than blocking indefinitely (client/connect timeouts on the WebDAV client).
- **Baseline drift / missed conflicts** if a file is changed outside the app between syncs → detection is hash-based against `synced_hash`, so any divergence is caught at the next Sync; worst case is a conflict prompt, never silent data loss.
- **Whole-file conflict resolution can discard the non-chosen side** → the discarded side remains recoverable from history (its content is recorded as a change entry), so nothing is permanently lost.
- **WebDAV path/encoding mismatches** (spaces, non-ASCII, nested dirs) → centralize path→URL mapping in `WebDavClient` and ensure MKCOL of parent collections before PUT; cover with tests.
- **Reshaping `GET /api/snapshots` is a breaking API/response change** → update the frontend in the same change; no external consumers.
- **New dependency (Sardine) supply-chain/maintenance** → pin version, isolate behind `WebDavClient`.

## Migration Plan

1. Add Flyway migrations: `source` column on the history tables (default `JOB`/`LOCAL_EDIT` for existing rows) and the `vault_file_sync` baseline table.
2. Ship `WebDavClient` disabled-by-default (blank `WEBDAV_URL`) so deploying without WebDAV config changes nothing operationally.
3. First real Sync seeds `vault_file_sync` baselines from current local+remote state (files equal on both sides are baselined without conflict).
4. Rollback: unset the WebDAV env vars to disable replication; the new history read path and editor preview work independently of WebDAV. The removed hard-reset endpoint is the only irreversible API change — retain the underlying data so it could be re-exposed if needed.

## Open Questions

- Should the initial baseline-seeding Sync treat a file that exists remotely but not locally (or vice versa) as a pull/push, or leave it for the first explicit Sync? (Proposed: treat as normal add on first Sync.)
- Where should the Sync button live primarily — history screen, explorer toolbar, or both?
- Retention: keep unlimited per-file versions (current behavior) or cap/prune old entries to bound DB growth?
