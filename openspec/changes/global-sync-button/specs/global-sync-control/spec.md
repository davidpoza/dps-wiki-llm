## ADDED Requirements

### Requirement: Global sync trigger reachable from any screen

The system SHALL provide a single global control to start a WebDAV sync that is available on every authenticated screen. Activating the control SHALL enqueue a sync via `POST /api/webdav/sync` and begin tracking the resulting job, without requiring the user to navigate to the Changes page.

#### Scenario: Trigger sync from a non-Changes screen

- **WHEN** an authenticated user activates the global sync control while on the Explorer, Chat, Ingest, Review, Settings, or Profile screen
- **THEN** the system SHALL enqueue a sync job and begin reporting its progress in place, without navigating away from the current screen

#### Scenario: Same sync engine as the Changes page

- **WHEN** a sync is started from the global control and separately from the Changes page
- **THEN** both SHALL use the same underlying sync orchestration and conflict state, so there is never more than one active sync or more than one conflict dialog at a time

### Requirement: Single-flight sync with visible in-progress state

The global sync control SHALL reflect whether a sync is currently running and SHALL prevent starting a second sync while one is in progress.

#### Scenario: Control shows in-progress state

- **WHEN** a sync job is enqueued and has not yet reached a terminal state
- **THEN** the global sync control SHALL show an in-progress (busy) state and SHALL be disabled

#### Scenario: Second activation is ignored while running

- **WHEN** the user activates the global sync control while a sync is already in progress
- **THEN** the system SHALL NOT enqueue a second sync job

#### Scenario: Control returns to idle after completion

- **WHEN** the running sync job reaches a terminal state (completed or failed)
- **THEN** the global sync control SHALL return to its idle, enabled state

### Requirement: Real-time sync progress toast

While a sync is running the system SHALL display a progress toast that updates in real time from the job event stream, showing the sync is in progress together with a completion percentage and, when available, the file currently being processed.

#### Scenario: Toast appears when sync starts

- **WHEN** a sync job is enqueued
- **THEN** the system SHALL display a progress toast indicating that a sync is running

#### Scenario: Toast reflects live progress

- **WHEN** the tracked sync job emits `sync-scan` progress events carrying a current/total count and a file path
- **THEN** the toast SHALL update to show the corresponding percentage and the current file path without a page reload

#### Scenario: Progress derived from the shared job stream

- **WHEN** the sync job's progress is already available in the application's job event store
- **THEN** the toast SHALL derive its progress from that shared store rather than opening a separate connection

### Requirement: Terminal success and error feedback

When the tracked sync job reaches a terminal state the toast SHALL collapse to a short summary reflecting the outcome.

#### Scenario: Successful sync summary

- **WHEN** the sync job completes successfully
- **THEN** the toast SHALL show a success summary (e.g. counts of pulled, pushed, deleted, and conflicts) and SHALL auto-dismiss after a short delay

#### Scenario: Failed sync feedback

- **WHEN** the sync job fails
- **THEN** the toast SHALL show an error state indicating the sync failed and SHALL be dismissible by the user

#### Scenario: WebDAV not configured

- **WHEN** the sync cannot run because WebDAV is not configured
- **THEN** the toast SHALL show a clear "WebDAV not configured" style error rather than an indefinite progress state

### Requirement: Automatic conflict dialog on conflicts

When a completed sync reports one or more conflicts, the system SHALL automatically open the existing conflict-resolution dialog regardless of the screen the user is currently on, reusing the established conflict-resolution behavior (collapsed list, bulk actions, skip, and manual three-pane merge editor) without change.

#### Scenario: Conflicts open the dialog anywhere

- **WHEN** a sync started from any screen completes and `GET /api/webdav/conflicts` returns at least one conflict
- **THEN** the system SHALL open the conflict-resolution dialog on the current screen, populated with those conflicts

#### Scenario: No conflicts leaves the dialog closed

- **WHEN** a sync completes and there are no unresolved conflicts
- **THEN** the system SHALL NOT open the conflict-resolution dialog

#### Scenario: Resolving conflicts from anywhere

- **WHEN** the user resolves conflicts in the dialog opened by a global sync
- **THEN** the system SHALL call `POST /api/webdav/conflicts/resolve` with the chosen resolution exactly as it does from the Changes page, and SHALL close the dialog once no unresolved conflicts remain
