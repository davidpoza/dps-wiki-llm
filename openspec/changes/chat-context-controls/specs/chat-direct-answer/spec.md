## MODIFIED Requirements

### Requirement: Chat answers are generated synchronously without creating a job
The system SHALL answer user messages via a synchronous REST endpoint (`POST /api/chat/sessions/{id}/messages`) that returns the assistant response directly, without enqueuing a background job and without writing any file to the vault.

The pipeline internally: (1) performs semantic search on the knowledge base, (2) builds a context packet — optionally expanded with linked notes and bounded by the configured context budget, (3) opens a token-accounting context and calls the LLM, (4) persists the assistant message together with the sources used and the token usage of the turn, (5) returns the response including those sources and token counts.

#### Scenario: Send message and receive answer
- **WHEN** the user posts `{ "content": "¿Qué es la inflamación?" }` to `/api/chat/sessions/{id}/messages`
- **THEN** the system appends the user message to the session, queries the knowledge base, synthesizes an answer, persists the assistant message, and returns both messages (user + assistant) with 200 OK

#### Scenario: Response carries sources and token usage
- **WHEN** the chat endpoint returns an assistant message
- **THEN** that message includes the list of source notes loaded into context and the token counts (prompt, completion, total) for the turn

#### Scenario: No file is written to disk
- **WHEN** a user receives an answer via the chat endpoint
- **THEN** no file is created under `outputs/` or any vault path

#### Scenario: Conversation history is included as LLM context
- **WHEN** the session already has previous messages
- **THEN** the last N message pairs (up to a configured token budget) are included in the LLM prompt so the assistant can refer to prior context

#### Scenario: Empty question is rejected
- **WHEN** the user posts a message with blank content
- **THEN** the system returns 400 Bad Request
