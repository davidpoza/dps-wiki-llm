# snapshot-versioning Specification

## Purpose
TBD - created by archiving change replace-git-with-db-versioning. Update Purpose after archive.
## Requirements
### Requirement: Capture snapshot before write operations
Before any write to a vault file, the system SHALL capture the current content of that file as `content_before` and, after the write, the new content as `content_after`, storing each change as an individual per-file history entry. Each entry SHALL record the source of the change and, when applicable, the job that caused it. The system SHALL no longer group changes under a user-visible "commit".

#### Scenario: New file created
- **WHEN** a write creates a file that did not previously exist in the vault
- **THEN** the system SHALL store `content_before = NULL` and `content_after = <new content>` for that file's change entry

#### Scenario: Existing file modified
- **WHEN** a write overwrites an existing vault file
- **THEN** the system SHALL store `content_before = <original content>` and `content_after = <new content>` for that file's change entry

#### Scenario: File deleted
- **WHEN** a write deletes a vault file
- **THEN** the system SHALL store `content_before = <original content>` and `content_after = NULL` for that file's change entry

### Requirement: Snapshot linked to job
The system SHALL associate each snapshot with the job that caused it, storing `job_id` in the `snapshots` table and `snapshot_id` in the `jobs` table upon job completion.

#### Scenario: Job completes successfully
- **WHEN** a write job completes with COMPLETED or AWAITING_REVIEW status
- **THEN** the `jobs` record SHALL have a non-null `snapshot_id` pointing to the finalized snapshot

#### Scenario: Job fails
- **WHEN** a write job fails before completing
- **THEN** any partial snapshot SHALL be deleted or marked as incomplete and SHALL NOT appear in the history

### Requirement: List snapshot history
The system SHALL expose an endpoint that returns the change history as a flat, reverse-chronological list of **per-file change entries** rather than grouped commits. Each entry SHALL include: the file `path`, `linesAdded`, `linesDeleted`, a `createdAt` timestamp, the change `source` (local edit, job, or WebDAV pull), and an identifier usable to fetch that entry's diff.

#### Scenario: Default history listing
- **WHEN** a client requests the change history without parameters
- **THEN** the system SHALL return up to 50 per-file change entries, newest first, each with `path`, `linesAdded`, `linesDeleted`, `createdAt`, and `source`

#### Scenario: Limited history listing
- **WHEN** a client requests the history with an explicit limit
- **THEN** the system SHALL return at most that many per-file change entries

#### Scenario: Source is surfaced
- **WHEN** a change originated from a local edit, a background job, or a WebDAV pull
- **THEN** the corresponding history entry SHALL carry the matching `source` value so the screen can display where the change came from

### Requirement: Per-file diff for a snapshot
The system SHALL expose an endpoint that returns a unified diff for an individual file change entry, comparing that entry's `content_before` and `content_after` in memory without filesystem or git access.

#### Scenario: Diff of a modified file
- **WHEN** a client requests the diff for a file change entry that modified an existing file
- **THEN** the system SHALL return a unified diff comparing `content_before` and `content_after`

#### Scenario: Diff of a new file
- **WHEN** a client requests the diff for a change entry that newly created a file (`content_before = NULL`)
- **THEN** the system SHALL return a diff showing all lines as added

#### Scenario: Diff for an unknown change entry
- **WHEN** a client requests the diff for a change entry that does not exist
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

