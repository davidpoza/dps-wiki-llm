## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Hard reset to a snapshot
**Reason**: The commit/snapshot-grouping concept is removed; history is now per-file, so a single "reset the whole vault to a snapshot" operation no longer fits the model.
**Migration**: To roll a file back to an earlier state, preview the desired prior version in the editor (see the `file-version-preview` capability) and restore it, which saves that content through the normal save path and replicates it to WebDAV.
