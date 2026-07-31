## MODIFIED Requirements

### Requirement: Manual sync pulls remote changes

The system SHALL expose an endpoint `POST /api/jobs/sync` that enqueues a background job of type `SYNC` in the write queue and returns `202 Accepted` with the job ID. When processed, the job SHALL fetch the current state of the WebDAV repository, compare each remote file against its local last-synced baseline, and for every remote-only change apply it to the vault and record a history entry tagged with source `WEBDAV_PULL`. Progress SHALL be reported through the global job event stream, and the job SHALL be observable in the jobs panel and persisted in the job history.

#### Scenario: Sync enqueued as a job

- **WHEN** a client calls `POST /api/jobs/sync`
- **THEN** the system persists a `SYNC` job with status `QUEUED`, returns `202 Accepted` with the job ID, and the write worker processes it

#### Scenario: Remote file added or modified with no local change

- **WHEN** the sync job runs and a remote file was added or modified since the last sync while the local copy was unchanged since the last sync
- **THEN** the system SHALL write the remote content to the vault, record a history entry with source `WEBDAV_PULL`, and update the file's baseline

#### Scenario: Remote file deleted with no local change

- **WHEN** the sync job runs and a file present at the last sync no longer exists on WebDAV while the local copy was unchanged
- **THEN** the system SHALL delete the local file and record a `WEBDAV_PULL` history entry for the deletion

#### Scenario: Progress events during execution

- **WHEN** the sync job is scanning files
- **THEN** the worker emits `PROGRESS` job events (step `sync-scan`) carrying the current file path and a JSON `result` with `current` and `total`, consumed by the jobs panel

#### Scenario: Sync summary

- **WHEN** the sync job completes
- **THEN** the job SHALL transition to `COMPLETED` with a summary message and a `result` field listing the files pulled, pushed, deleted, and any unresolved conflicts

#### Scenario: WebDAV not configured

- **WHEN** the sync job runs while WebDAV replication is disabled (missing configuration)
- **THEN** the job SHALL transition to `FAILED` with a clear "WebDAV not configured" message rather than mutating the vault

## ADDED Requirements

### Requirement: Manual sync runs as a revertible job

The system SHALL capture the local mutations produced by a sync job (files pulled from the remote and files deleted locally because they were removed remotely) in a snapshot linked to the `SYNC` job, and SHALL record those local paths in the job's affected-paths metadata. A completed `SYNC` job that produced local changes SHALL be revertible via `POST /api/jobs/{id}/revert`, restoring the local vault to its pre-sync state and marking the sync job `REVERTED`. The revert SHALL restore only the local files; pushes to the remote are not undone by the revert itself and are instead propagated on the next sync.

#### Scenario: Revert restores pulled content

- **WHEN** a completed sync job pulled or deleted local files, and the user reverts it via `POST /api/jobs/{id}/revert`
- **THEN** the system restores those local files to their pre-sync content (undoing pulls and re-creating locally-deleted files), reindexes, and marks the sync job `REVERTED`

#### Scenario: Revert offered only when local changes occurred

- **WHEN** a sync job completed without producing any local changes (e.g. only pushes, or nothing to do) and therefore has no linked snapshot
- **THEN** the client SHALL NOT offer the revert action for that job, and any revert attempt SHALL be rejected with a "no snapshot to revert" error

#### Scenario: Revert blocked by a later conflicting change

- **WHEN** the user reverts a sync job but a later job modified a file that the sync had pulled
- **THEN** the system reports a conflict and does not overwrite the later change

## REMOVED Requirements

### Requirement: Real-time sync progress via per-invocation SSE

**Reason**: The manual sync now runs as a background `SYNC` job; progress is reported through the existing global job event stream and observed in the jobs panel, not through a dedicated SSE stream tied to the browser connection.
**Migration**: Clients call `POST /api/jobs/sync` to enqueue the job and follow progress via the job event stream using the returned job ID. The endpoint `GET /api/webdav/sync` is removed. The conflict endpoints (`GET /api/webdav/conflicts`, `POST /api/webdav/conflicts/resolve`) are unchanged.
