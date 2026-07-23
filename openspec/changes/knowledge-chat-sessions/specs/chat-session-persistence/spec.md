## ADDED Requirements

### Requirement: Chat sessions are persisted in the database
The system SHALL store chat sessions and their messages in the database so they survive server restarts and are available across page loads.

A **chat session** has: id (UUID), title (auto-generated from first user message, max 60 chars), created_at, updated_at, and belongs to a user.  
A **chat message** has: id (UUID), session_id, role (`user` | `assistant`), content (text), created_at.

#### Scenario: Create new session
- **WHEN** a user sends the first message of a conversation
- **THEN** a new `ChatSession` record is created with a title derived from the first 60 characters of the user's message

#### Scenario: Messages are appended in order
- **WHEN** subsequent messages are added to a session
- **THEN** they are stored with increasing `created_at` and retrieved in that order

#### Scenario: List sessions for authenticated user
- **WHEN** the user requests their session list via `GET /api/chat/sessions`
- **THEN** the system returns sessions ordered by `updated_at DESC`, with id, title, created_at, updated_at — but without message content

#### Scenario: Retrieve full session with messages
- **WHEN** the user requests `GET /api/chat/sessions/{id}`
- **THEN** the system returns the session metadata plus all messages in chronological order

#### Scenario: Delete a session
- **WHEN** the user calls `DELETE /api/chat/sessions/{id}`
- **THEN** the session and all its messages are removed from the database

### Requirement: Sessions are scoped to the authenticated user
The system SHALL prevent users from accessing or modifying sessions that belong to other users.

#### Scenario: Access own session
- **WHEN** the authenticated user requests a session they own
- **THEN** the system returns the session data

#### Scenario: Access other user's session
- **WHEN** the authenticated user requests a session owned by another user
- **THEN** the system returns 404 Not Found
