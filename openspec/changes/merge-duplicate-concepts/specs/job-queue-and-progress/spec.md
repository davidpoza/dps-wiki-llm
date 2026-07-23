## MODIFIED Requirements

### Requirement: Persisted job lifecycle
The system SHALL persist each job with a status that transitions through `QUEUED → STARTED → COMPLETED` or `→ FAILED`, and additionally `→ AWAITING_REVIEW` for validated ingests (pending a human decision) and `→ REVERTED` after a successful revert, recording the job type, mode, payload reference, timestamps, and result or error. The `JobType` enum SHALL include `INGEST`, `ANSWER`, `REVERT`, `ENRICH`, and `MERGE`.

#### Scenario: Status is queryable
- **WHEN** a client requests a job by id
- **THEN** the system returns its current status and, when finished, its result or error

#### Scenario: MERGE job follows standard lifecycle
- **WHEN** a MERGE job is enqueued
- **THEN** its status transitions through `QUEUED → STARTED → COMPLETED` (or `→ FAILED`) and it is queryable by id
