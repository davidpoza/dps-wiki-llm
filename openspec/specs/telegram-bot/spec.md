# telegram-bot Specification

## Purpose
TBD - created by archiving change spring-angular-migration. Update Purpose after archive.
## Requirements
### Requirement: Backend-hosted Telegram long polling

The system SHALL run a Telegram bot inside the backend using long polling (`getUpdates`), replacing the n8n Telegram workflow, and SHALL require only outbound HTTPS to Telegram.

#### Scenario: Bot polls for updates

- **WHEN** the backend starts with a configured Telegram token
- **THEN** the bot begins long polling for updates without requiring a public inbound webhook

### Requirement: Chat authorization

The system SHALL only process updates from the configured allowed chat id and SHALL ignore updates from any other chat.

#### Scenario: Unauthorized chat is ignored

- **WHEN** an update arrives from a chat id other than the configured allowed id
- **THEN** the update is ignored and no job is enqueued

### Requirement: Command routing onto the job queue

The system SHALL route `/ask` (and free text) to the answer job queue and `/ingest <url>` to the ingest job queue, returning the enqueue acknowledgement, and SHALL send the job result back to the originating chat when the job completes.

#### Scenario: Ask command enqueues an answer job

- **WHEN** an authorized chat sends `/ask <question>` or free text
- **THEN** the system enqueues an answer job and, on completion, sends the synthesized answer back to that chat

#### Scenario: Ingest command enqueues an ingest job

- **WHEN** an authorized chat sends `/ingest <url>`
- **THEN** the system enqueues an ingest job and sends the ingest outcome (including handled failures) back to that chat

### Requirement: Single-consumer safety

The system SHALL ensure Telegram-triggered jobs honor the same serialized write-queue guarantees as REST-triggered jobs, so concurrent updates do not run overlapping vault mutations.

#### Scenario: Concurrent ingest commands are serialized

- **WHEN** two `/ingest` commands arrive close together
- **THEN** both are enqueued and processed sequentially by the single write consumer

