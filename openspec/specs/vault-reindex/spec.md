# vault-reindex Specification

## Purpose
TBD - created by archiving change settings-vault-reindex. Update Purpose after archive.
## Requirements
### Requirement: Trigger vault reindex from Settings

The system SHALL expose a `POST /settings/reindex` endpoint that initiates a full reindex of the vault and returns a Server-Sent Events (SSE) stream with incremental progress.

#### Scenario: Reindex starts successfully

- **WHEN** the user sends `POST /settings/reindex`
- **THEN** the response SHALL be `Content-Type: text/event-stream`
- **AND** the first SSE event SHALL be of type `progress` with `{ "processed": 0, "total": N }` where `N` is the number of `.md` files found in the vault

#### Scenario: Progress events emitted per file

- **WHEN** each `.md` file is processed during reindexation
- **THEN** the backend SHALL emit an SSE event of type `progress` with `{ "processed": X, "total": N }` where `X` increments by 1 per file

#### Scenario: Reindex completes successfully

- **WHEN** all files have been processed and the index replaced
- **THEN** the backend SHALL emit a final SSE event of type `done` with `{ "processed": N, "total": N }`
- **AND** the SSE stream SHALL be closed

#### Scenario: Reindex fails

- **WHEN** an unrecoverable error occurs during reindexation
- **THEN** the backend SHALL emit an SSE event of type `error` with `{ "message": "<error description>" }`
- **AND** the SSE stream SHALL be closed

#### Scenario: Vault directory does not exist

- **WHEN** `POST /settings/reindex` is called and the vault `wiki` directory does not exist
- **THEN** the backend SHALL emit a `done` event with `{ "processed": 0, "total": 0 }`
- **AND** the document index SHALL be replaced with an empty list

### Requirement: Real-time progress displayed in Settings UI

The Settings screen SHALL include a "Índice del Vault" section with a "Reindexar" button and a real-time progress indicator.

#### Scenario: Initial state

- **WHEN** the user navigates to Settings
- **THEN** the "Reindexar" button SHALL be enabled
- **AND** no progress indicator SHALL be visible

#### Scenario: Reindex in progress

- **WHEN** the user clicks "Reindexar"
- **THEN** the button SHALL become disabled and show a loading state
- **AND** a progress text SHALL appear showing "Ficheros procesados X/Y" updated on each `progress` SSE event

#### Scenario: Reindex completes

- **WHEN** a `done` SSE event is received
- **THEN** the progress text SHALL show "Reindexación completada (N ficheros)"
- **AND** the button SHALL be re-enabled
- **AND** the success message SHALL auto-dismiss after 5 seconds

#### Scenario: Reindex fails in UI

- **WHEN** an `error` SSE event is received
- **THEN** the progress indicator SHALL show "Error en la reindexación"
- **AND** the button SHALL be re-enabled

#### Scenario: Only one reindex at a time

- **WHEN** a reindex is already in progress
- **THEN** the "Reindexar" button SHALL remain disabled until the current reindex finishes or fails

