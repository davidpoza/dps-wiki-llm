# file-version-preview Specification

## Purpose
TBD - created by archiving change webdav-vault-sync-and-file-history. Update Purpose after archive.
## Requirements
### Requirement: List prior versions of a file
The system SHALL expose an endpoint `GET /api/files/versions?path=<relPath>` that returns the recorded prior versions of the given file in reverse chronological order, each with a `versionId`, `createdAt` timestamp, and `source` (local edit, job, or WebDAV pull).

#### Scenario: File with history
- **WHEN** a client requests versions for a path that has recorded changes
- **THEN** the system SHALL return the list of versions, newest first, each identifying the version and its source

#### Scenario: File with no prior versions
- **WHEN** a client requests versions for a path that has never changed
- **THEN** the system SHALL return an empty list

### Requirement: Retrieve a prior version's content
The system SHALL expose an endpoint `GET /api/files/version?path=<relPath>&versionId=<id>` that returns the full content of the file as it was at that version.

#### Scenario: Existing version content
- **WHEN** a client requests the content of a valid version of a file
- **THEN** the system SHALL return the exact stored content for that version

#### Scenario: Unknown version
- **WHEN** a client requests a version that does not exist for the path
- **THEN** the system SHALL return HTTP 404

### Requirement: Preview a prior version in the editor with a diff
From the file editor, the user SHALL be able to select a prior version of the open file and see it in a read-only preview together with a diff of that previewed version against the current content.

#### Scenario: Enter preview
- **WHEN** the user selects a prior version of the open file
- **THEN** the editor SHALL display that version's content in a read-only preview and show a diff comparing the previewed version to the current file content

#### Scenario: Exit preview without changes
- **WHEN** the user closes the preview without restoring
- **THEN** the editor SHALL return to the current file content unchanged and no new version SHALL be recorded

#### Scenario: Restore a previewed version
- **WHEN** the user chooses to restore the previewed version
- **THEN** the system SHALL save the previewed content through the normal save path, creating a new current version and replicating it to WebDAV

