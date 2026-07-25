## MODIFIED Requirements

### Requirement: Health Check action in Settings

The system SHALL provide a "Health Check" section in the Settings screen with two controls:
1. A primary button "Lanzar Health Check" that enqueues a full vault reconciliation job and redirects/indicates progress via the jobs panel.
2. A secondary button "Seleccionar notas…" that opens a file-selection modal for running the Health Check on a subset of notes.

#### Scenario: Launching the full health check

- **WHEN** the user clicks the "Lanzar Health Check" button in Settings
- **THEN** the system sends `POST /api/jobs/health-check` and receives a job ID
- **AND** the button is disabled briefly while the enqueue request is in flight
- **AND** the user can follow progress in the jobs panel

#### Scenario: Opening the partial selection modal

- **WHEN** the user clicks "Seleccionar notas…" in the Health Check section
- **THEN** a file-selection modal opens showing notes from `wiki/concepts` and `wiki/sources`

#### Scenario: Idle state before running

- **WHEN** the Settings screen is opened and the health check has not been run
- **THEN** the Health Check section shows both buttons enabled and no progress indicator

## REMOVED Requirements

### Requirement: Real-time progress reporting via SSE

**Reason**: The health check now runs as a background job; progress is reported through the existing global job event stream (`/api/jobs/stream`), not a dedicated SSE endpoint per invocation.
**Migration**: Frontend consumers subscribe to the job event stream using the job ID returned by `POST /api/jobs/health-check`. The endpoints `GET /api/settings/health-check` and `GET /api/settings/health-check/partial` are removed.

## ADDED Requirements

### Requirement: Health check enqueued as a background job

The system SHALL expose `POST /api/jobs/health-check` which enqueues a `HEALTH_CHECK` job in the write queue and returns `202 Accepted` with the job ID. The job SHALL be processed by the write worker, using `HealthCheckService` for the two phases, and SHALL emit progress events via `JobLifecycleService` with `step = "embeddings"` or `"connections"` and a JSON `result` field containing `processed`, `total`, `embeddingsBuilt`, and `connectionsFound`.

#### Scenario: Full health check enqueued

- **WHEN** `POST /api/jobs/health-check` is called
- **THEN** the system persists a `HEALTH_CHECK` job with status `QUEUED` and returns `202 Accepted` with the job ID

#### Scenario: Progress events during execution

- **WHEN** the health check job is running
- **THEN** the worker emits `PROGRESS` job events with `step = "embeddings"` or `"connections"` and a JSON result with `processed`, `total`, `embeddingsBuilt`, `connectionsFound`

#### Scenario: Job completes successfully

- **WHEN** both phases finish
- **THEN** the job transitions to `COMPLETED` with a summary message containing the final `embeddingsBuilt` and `connectionsFound` counts

#### Scenario: Job fails

- **WHEN** an unhandled error occurs during execution
- **THEN** the job transitions to `FAILED` with the error message stored
