# job-queue-and-progress Specification

## Purpose
TBD - created by archiving change spring-angular-migration. Update Purpose after archive.
## Requirements
### Requirement: Durable job queues with serialized writes

The system SHALL enqueue jobs onto durable RabbitMQ queues, processing state-mutating (write) jobs through a single sequential consumer (`prefetch=1`, one concurrent consumer) and read/answer jobs through a separate queue.

#### Scenario: Write jobs never run concurrently

- **WHEN** two ingest jobs are enqueued while one is processing
- **THEN** the second job waits and is processed only after the first completes, preserving deterministic sequential vault mutation

#### Scenario: Jobs survive a broker restart

- **WHEN** the broker restarts with unacknowledged durable messages
- **THEN** the queued jobs are redelivered and processed after restart

### Requirement: Enqueue via REST returning accepted

The system SHALL expose REST endpoints that enqueue ingest and answer jobs and respond `202 Accepted` with a job identifier and queue position, without blocking on job completion.

#### Scenario: Enqueue returns a job handle

- **WHEN** a client POSTs an ingest or answer request
- **THEN** the system creates a persisted job record, enqueues it, and returns `202 Accepted` with the job id and queue position

### Requirement: Persisted job lifecycle

The system SHALL persist each job with a status that transitions through `QUEUED → STARTED → COMPLETED` or `→ FAILED`, and additionally `→ AWAITING_REVIEW` for validated ingests (pending a human decision) and `→ REVERTED` after a successful revert, recording the job type, mode, payload reference, timestamps, and result or error.

#### Scenario: Status is queryable

- **WHEN** a client requests a job by id
- **THEN** the system returns its current status and, when finished, its result or error

### Requirement: Retries and dead-lettering

The system SHALL retry a failed job a bounded number of times and SHALL route a job that exhausts its retries to a dead-letter queue while marking the persisted job `FAILED`.

#### Scenario: Exhausted retries dead-letter the job

- **WHEN** a job fails on every allowed attempt
- **THEN** the message is routed to the dead-letter queue and the job record is marked `FAILED` with the last error

### Requirement: SSE broadcasting of job progress

The system SHALL expose an SSE endpoint (`GET /api/jobs/events`) that registers subscribers and broadcasts job lifecycle events (`QUEUED`, `STARTED`, `PROGRESS`, `AWAITING_REVIEW`, `COMPLETED`, `FAILED`, `REVERTED`) plus per-file events for files a job touches, to all connected clients, removing emitters on completion, timeout, or error.

#### Scenario: Subscriber receives lifecycle and file events

- **WHEN** a client is subscribed to the SSE endpoint and a job advances through its lifecycle
- **THEN** the client receives an event for each transition, intermediate `PROGRESS` updates for long-running steps, and a per-file event (path + action) for each vault file the job reads, creates, or updates

#### Scenario: Dead emitters are cleaned up

- **WHEN** sending to a subscriber fails or the connection times out
- **THEN** the emitter is removed from the registry and other subscribers keep receiving events

