## MODIFIED Requirements

### Requirement: Side-by-side conflict resolution
The system SHALL expose `GET /api/webdav/conflicts` returning unresolved conflicts (each with `path`, local content, and remote content) and `POST /api/webdav/conflicts/resolve` accepting `{ path, keep: "LOCAL" | "REMOTE" | "SKIP" | "MANUAL", content?: string }`. The client SHALL present the two versions side by side as a diff, and the user SHALL choose which file version to preserve, skip without changes, or replace with custom content.

#### Scenario: List pending conflicts
- **WHEN** a client calls `GET /api/webdav/conflicts` after a Sync produced conflicts
- **THEN** the system SHALL return each conflicting path with its local and remote content for side-by-side display

#### Scenario: Resolve by keeping local
- **WHEN** the user resolves a conflict with `keep: "LOCAL"`
- **THEN** the system SHALL push the local content to WebDAV, clear the conflict, update the baseline, and record a history entry

#### Scenario: Resolve by keeping remote
- **WHEN** the user resolves a conflict with `keep: "REMOTE"`
- **THEN** the system SHALL write the remote content to the vault, clear the conflict, update the baseline, and record a `WEBDAV_PULL` history entry

#### Scenario: Resolve by skipping
- **WHEN** the user resolves a conflict with `keep: "SKIP"`
- **THEN** the system SHALL clear the conflict flag and remote content in the database without writing to the local vault or WebDAV, and SHALL NOT create a history entry

#### Scenario: Resolve with manual content
- **WHEN** the user resolves a conflict with `keep: "MANUAL"` and provides a `content` string
- **THEN** the system SHALL write `content` to the local vault, push `content` to WebDAV, update the baseline to the sha256 of `content`, clear the conflict flag, and record a `WEBDAV_PULL` history entry

#### Scenario: Manual resolve with missing content
- **WHEN** the client sends `keep: "MANUAL"` without a `content` field or with blank content
- **THEN** the system SHALL return HTTP 400

#### Scenario: Non-conflicting changes still apply
- **WHEN** a Sync produces both conflicts and non-conflicting remote changes
- **THEN** the system SHALL apply all non-conflicting changes and leave only the conflicts pending resolution
