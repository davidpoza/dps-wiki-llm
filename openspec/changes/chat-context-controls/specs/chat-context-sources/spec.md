## ADDED Requirements

### Requirement: The notes loaded into context are recorded per assistant message

For every assistant answer produced by the chat pipeline, the system SHALL persist the ordered list of notes that were actually included in the LLM context. Each recorded source SHALL include the note path, its similarity score to the query, and its provenance (whether it was a direct semantic hit or a linked note, including the expansion depth at which it was reached). Sources SHALL be persisted alongside the assistant `ChatMessage` and returned in both the send-message response and the session-detail payload.

#### Scenario: Sources are returned with the answer
- **WHEN** the user sends a message and receives an answer
- **THEN** the response for the assistant message includes the list of source notes with path, score, and provenance

#### Scenario: Sources persist across reload
- **WHEN** the user reloads a session via `GET /api/chat/sessions/{id}`
- **THEN** each historical assistant message still carries the sources that were used to generate it

#### Scenario: No sources when the knowledge base returns nothing
- **WHEN** semantic retrieval returns no notes for a query
- **THEN** the assistant message records an empty source list and the UI indicates no sources were used

### Requirement: The chat UI displays the sources used for each answer

The chat interface SHALL display, under each assistant message, the notes that were loaded into context. Each source SHALL show its path and be visually distinguishable by provenance (direct hit vs. linked). Source paths SHALL be rendered so the user can identify the originating note.

#### Scenario: Fuentes list rendered under an answer
- **WHEN** an assistant message has one or more recorded sources
- **THEN** a "Fuentes" section listing those notes is shown under the message bubble

#### Scenario: Linked sources are marked as such
- **WHEN** a source note was added via link expansion rather than direct retrieval
- **THEN** the UI marks it as a linked source (e.g. with its depth) to distinguish it from direct hits
