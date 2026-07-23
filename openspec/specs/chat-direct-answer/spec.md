# chat-direct-answer Specification

## Purpose
TBD - created by archiving change knowledge-chat-sessions. Update Purpose after archive.
## Requirements
### Requirement: Chat answers are generated synchronously without creating a job
The system SHALL answer user messages via a synchronous REST endpoint (`POST /api/chat/sessions/{id}/messages`) that returns the assistant response directly, without enqueuing a background job and without writing any file to the vault.

The pipeline internally: (1) performs semantic search on the knowledge base, (2) builds a context packet, (3) calls the LLM, (4) persists the assistant message, (5) returns the response.

#### Scenario: Send message and receive answer
- **WHEN** the user posts `{ "content": "¿Qué es la inflamación?" }` to `/api/chat/sessions/{id}/messages`
- **THEN** the system appends the user message to the session, queries the knowledge base, synthesizes an answer, persists the assistant message, and returns both messages (user + assistant) with 200 OK

#### Scenario: No file is written to disk
- **WHEN** a user receives an answer via the chat endpoint
- **THEN** no file is created under `outputs/` or any vault path

#### Scenario: Conversation history is included as LLM context
- **WHEN** the session already has previous messages
- **THEN** the last N message pairs (up to a configured token budget) are included in the LLM prompt so the assistant can refer to prior context

#### Scenario: Empty question is rejected
- **WHEN** the user posts a message with blank content
- **THEN** the system returns 400 Bad Request

### Requirement: The existing `/api/answer` job endpoint is preserved
The system SHALL keep the existing `POST /api/answer` endpoint and `AnswerPipelineService` unchanged so the Telegram bot continues to function.

#### Scenario: Telegram bot still works
- **WHEN** the Telegram bot sends a question via `/api/answer`
- **THEN** the job is enqueued, processed, and the artifact written exactly as before

