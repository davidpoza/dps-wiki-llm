# webdav-vault-sync Specification

## Purpose
TBD - created by archiving change webdav-vault-sync-and-file-history. Update Purpose after archive.
## Requirements
### Requirement: WebDAV connection configuration
The system SHALL read the WebDAV endpoint URL, username, and password from the environment variables `WEBDAV_URL`, `WEBDAV_USERNAME`, and `WEBDAV_PASSWORD`, and SHALL use them as credentials for all WebDAV operations. When these variables are absent or blank, WebDAV replication SHALL be disabled and local editing SHALL continue to function.

#### Scenario: WebDAV configured
- **WHEN** `WEBDAV_URL`, `WEBDAV_USERNAME`, and `WEBDAV_PASSWORD` are all set
- **THEN** the system SHALL enable push-on-save and the Sync button, using those credentials for every WebDAV request

#### Scenario: WebDAV not configured
- **WHEN** any of the WebDAV environment variables is missing or blank
- **THEN** the system SHALL disable WebDAV replication, keep local file editing working, and report a clear "WebDAV not configured" state to the client when the Sync button is used

### Requirement: Synchronous per-file push on save
When a file is created or modified locally, the system SHALL write the change to the Docker-volume vault, record it in the change history, and then synchronously push that single file to WebDAV before the save operation returns. The push SHALL be scoped to only the file being saved.

#### Scenario: Save with successful push
- **WHEN** a user saves a file and the WebDAV push of that file succeeds
- **THEN** the system SHALL return success, update the file's last-synced baseline, and the file SHALL exist at the corresponding WebDAV path with the saved content

#### Scenario: Save with failed push
- **WHEN** a user saves a file and the WebDAV push fails (WebDAV unreachable or rejects the request)
- **THEN** the system SHALL keep the local write and the history entry, mark the file as not yet replicated, and return an error indicating the change was saved locally but not replicated to WebDAV

### Requirement: Deletions and renames replicate to WebDAV
When a file is deleted or renamed locally, the system SHALL apply the equivalent operation to the WebDAV repository synchronously.

#### Scenario: Local delete replicates
- **WHEN** a user deletes a vault file
- **THEN** the system SHALL delete the corresponding resource at the WebDAV path

#### Scenario: Local rename replicates
- **WHEN** a user renames or moves a vault file
- **THEN** the system SHALL move the corresponding resource on WebDAV from the old path to the new path

### Requirement: Manual sync pulls remote changes
The system SHALL expose an endpoint `POST /api/webdav/sync` that fetches the current state of the WebDAV repository, compares each remote file against its local last-synced baseline, and for every remote-only change applies it to the vault and records a history entry tagged with source `WEBDAV_PULL`.

#### Scenario: Remote file added or modified with no local change
- **WHEN** Sync runs and a remote file was added or modified since the last sync while the local copy was unchanged since the last sync
- **THEN** the system SHALL write the remote content to the vault, record a history entry with source `WEBDAV_PULL`, and update the file's baseline

#### Scenario: Remote file deleted with no local change
- **WHEN** Sync runs and a file present at the last sync no longer exists on WebDAV while the local copy was unchanged
- **THEN** the system SHALL delete the local file and record a `WEBDAV_PULL` history entry for the deletion

#### Scenario: Sync summary
- **WHEN** Sync completes
- **THEN** the system SHALL return a summary listing the files pulled, files deleted, and any unresolved conflicts

### Requirement: Conflict detection via per-file baseline
The system SHALL maintain, per file, the identity of the content last synchronized with WebDAV (a remote ETag or a content hash). During Sync, a conflict SHALL be reported for a file when, since its last successful sync, both the local content changed and the remote content changed.

#### Scenario: Only remote changed
- **WHEN** the local content equals the last-synced baseline but the remote content differs
- **THEN** the system SHALL treat it as a non-conflicting remote change and apply it

#### Scenario: Only local changed
- **WHEN** the remote content equals the last-synced baseline but the local content differs
- **THEN** the system SHALL treat it as already-pushed local content and SHALL NOT report a conflict

#### Scenario: Both changed
- **WHEN** both the local content and the remote content differ from the last-synced baseline
- **THEN** the system SHALL record the file as a conflict and SHALL NOT overwrite either side automatically

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

### Requirement: Atajo de teclado Ctrl+Shift+S para sincronización
El editor SHALL disparar la sincronización WebDAV manual cuando el usuario pulsa `Ctrl+Shift+S`, de forma equivalente a pulsar el botón de sync en la toolbar. El atajo SHALL estar activo siempre que el componente explorer esté montado, independientemente del foco actual.

#### Scenario: Sync disparado con Ctrl+Shift+S estando el editor activo
- **WHEN** el usuario pulsa `Ctrl+Shift+S` con el editor Markdown en foco
- **THEN** el sistema inicia la sincronización WebDAV (igual que al pulsar el botón de sync), previene el comportamiento predeterminado del navegador, y el botón de sync muestra el estado de carga

#### Scenario: Ctrl+Shift+S mientras ya hay sync en curso
- **WHEN** el usuario pulsa `Ctrl+Shift+S` y ya hay una sincronización en progreso
- **THEN** el sistema no lanza una segunda sincronización (la guarda del guard `if (this.syncing()) return`)

