## MODIFIED Requirements

### Requirement: Manual sync pulls remote changes
The system SHALL expose an endpoint `GET /api/webdav/sync` (SSE) that fetches the current state of the WebDAV repository, compares each remote file against its local last-synced baseline, and for every remote-only change applies it to the vault and records a history entry tagged with source `WEBDAV_PULL`. Progress events SHALL be delivered via SSE with a throttled stride (≈100 events per sync) and SHALL NOT accumulate as visible lines in the UI — the frontend SHALL update a single in-place indicator.

#### Scenario: Remote file added or modified with no local change
- **WHEN** Sync runs and a remote file was added or modified since the last sync while the local copy was unchanged since the last sync
- **THEN** the system SHALL write the remote content to the vault, record a history entry with source `WEBDAV_PULL`, and update the file's baseline

#### Scenario: Remote file deleted with no local change
- **WHEN** Sync runs and a file present at the last sync no longer exists on WebDAV while the local copy was unchanged
- **THEN** the system SHALL delete the local file and record a `WEBDAV_PULL` history entry for the deletion

#### Scenario: Sync summary
- **WHEN** Sync completes
- **THEN** the system SHALL return a summary listing the files pulled, files deleted, and any unresolved conflicts

#### Scenario: Progress renders in place
- **WHEN** the sync SSE stream emits successive `progress` events
- **THEN** the UI SHALL update a single progress counter in place and SHALL NOT append a new visible row for each event
