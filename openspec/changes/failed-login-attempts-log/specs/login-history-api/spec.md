## MODIFIED Requirements

### Requirement: Authenticated endpoint returns login history

The system SHALL expose `GET /auth/login-history` that returns the last 20 `login_event` records recorded against the authenticated user's username — including failed attempts that are not linked to a `user` row (e.g. wrong-password attempts) — ordered by timestamp descending. Records SHALL be matched by the stored `username` being equal to the authenticated principal's username, so that no other account's events are ever returned.

#### Scenario: Authenticated user fetches history

- **WHEN** an authenticated user calls `GET /auth/login-history`
- **THEN** the response is HTTP 200 with a JSON array of up to 20 `LoginEventDto` objects whose stored `username` equals the caller's username, ordered by `createdAt` DESC

#### Scenario: Failed password attempt is included in history

- **WHEN** a failed `BAD_CREDENTIALS` login event exists whose stored `username` equals the authenticated user's username and which has no linked `user` row
- **THEN** the event appears in the `GET /auth/login-history` response with `success=false` and `failureReason` `BAD_CREDENTIALS`

#### Scenario: Only the caller's own attempts are returned

- **WHEN** login events exist for usernames other than the authenticated user's
- **THEN** those events are NOT included in the response

#### Scenario: Unauthenticated request rejected

- **WHEN** a request to `GET /auth/login-history` is made without a valid JWT
- **THEN** the response is HTTP 401

#### Scenario: User with no login events

- **WHEN** an authenticated user has no login events recorded against their username
- **THEN** the response is HTTP 200 with an empty JSON array `[]`
