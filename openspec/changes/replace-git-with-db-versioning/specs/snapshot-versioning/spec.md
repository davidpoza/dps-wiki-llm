## ADDED Requirements

### Requirement: Capture snapshot before write operations
Before any job writes files to the vault, the system SHALL capture the current content of each affected file and store it as `content_before` in a `snapshot_files` record linked to a `snapshots` record for that job.

#### Scenario: New file created by job
- **WHEN** a job writes a file that did not previously exist in the vault
- **THEN** the system SHALL store `content_before = NULL` and `content_after = <new content>` in `snapshot_files`

#### Scenario: Existing file modified by job
- **WHEN** a job overwrites an existing vault file
- **THEN** the system SHALL store `content_before = <original content>` and `content_after = <new content>` in `snapshot_files`

#### Scenario: File deleted by job
- **WHEN** a job deletes a vault file
- **THEN** the system SHALL store `content_before = <original content>` and `content_after = NULL` in `snapshot_files`

### Requirement: Snapshot linked to job
The system SHALL associate each snapshot with the job that caused it, storing `job_id` in the `snapshots` table and `snapshot_id` in the `jobs` table upon job completion.

#### Scenario: Job completes successfully
- **WHEN** a write job completes with COMPLETED or AWAITING_REVIEW status
- **THEN** the `jobs` record SHALL have a non-null `snapshot_id` pointing to the finalized snapshot

#### Scenario: Job fails
- **WHEN** a write job fails before completing
- **THEN** any partial snapshot SHALL be deleted or marked as incomplete and SHALL NOT appear in the history

### Requirement: List snapshot history
The system SHALL expose an endpoint `GET /api/snapshots?limit=N` that returns a paginated list of finalized snapshots in reverse chronological order.

#### Scenario: Default history listing
- **WHEN** a client calls `GET /api/snapshots` without parameters
- **THEN** the system SHALL return up to 50 snapshots, each with: `id`, `operationType`, `message`, `createdAt`, and a list of `files` with `path`, `linesAdded`, `linesDeleted`

#### Scenario: Limited history listing
- **WHEN** a client calls `GET /api/snapshots?limit=10`
- **THEN** the system SHALL return at most 10 snapshots

### Requirement: Per-file diff for a snapshot
The system SHALL expose an endpoint `GET /api/snapshots/{id}/diff?path=<relPath>` that returns a unified diff of the file changes in that snapshot.

#### Scenario: Diff of a modified file
- **WHEN** a client requests the diff for a path that was modified in a snapshot
- **THEN** the system SHALL return a unified diff string comparing `content_before` and `content_after`, computed in memory without filesystem or git access

#### Scenario: Diff of a new file
- **WHEN** a client requests the diff for a path that was newly created in a snapshot (content_before = NULL)
- **THEN** the system SHALL return a diff showing all lines as added

#### Scenario: Diff for unknown path in snapshot
- **WHEN** a client requests the diff for a path not present in the snapshot's files
- **THEN** the system SHALL return HTTP 404

### Requirement: Hard reset to a snapshot
The system SHALL expose an endpoint `POST /api/snapshots/{id}/reset` that restores the vault to the exact state captured in the specified snapshot by writing `content_before` of each file.

#### Scenario: Successful hard reset
- **WHEN** a client calls `POST /api/snapshots/{id}/reset`
- **THEN** for each file in the snapshot: if `content_before` is non-null the system SHALL overwrite the vault file with that content; if `content_before` is null the system SHALL delete the vault file
- **AND** the system SHALL return `{"snapshotId": "<id>"}` with HTTP 200

#### Scenario: Reset to nonexistent snapshot
- **WHEN** a client calls `POST /api/snapshots/{nonexistentId}/reset`
- **THEN** the system SHALL return HTTP 404

### Requirement: Revert a job via snapshot
The system SHALL allow reverting a completed job by restoring `content_before` for all files in the job's associated snapshot, with conflict detection.

#### Scenario: Clean revert with no conflicts
- **WHEN** `POST /api/jobs/{id}/revert` is called and no later job touched the same paths
- **THEN** the system SHALL write `content_before` of each snapshot file to the vault, reindex, and record the revert operation in the `operations` table

#### Scenario: Revert blocked by conflict
- **WHEN** `POST /api/jobs/{id}/revert` is called and a later job modified one or more of the same paths
- **THEN** the system SHALL return an error indicating which later jobs conflict, without modifying any vault files

#### Scenario: Revert of a revert job is rejected
- **WHEN** `POST /api/jobs/{id}/revert` is called for a job of type REVERT
- **THEN** the system SHALL return HTTP 400 with an explanatory error message

#### Scenario: Revert of already-reverted job is rejected
- **WHEN** `POST /api/jobs/{id}/revert` is called for a job with status REVERTED
- **THEN** the system SHALL return HTTP 400

### Requirement: No git dependency at runtime
The system SHALL NOT invoke git CLI commands or any git library at runtime for any versioning operation.

#### Scenario: Version history without git
- **WHEN** the vault directory does not contain a `.git` folder or git is not installed on the host
- **THEN** the snapshot history, diff, and revert endpoints SHALL function correctly

#### Scenario: WebDAV-mounted vault
- **WHEN** the vault is mounted via WebDAV
- **THEN** revert operations SHALL restore files without triggering git index corruption, because no git commands are issued
