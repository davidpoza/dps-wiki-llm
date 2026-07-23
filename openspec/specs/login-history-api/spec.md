# login-history-api Specification

## Purpose
TBD - created by archiving change profile-login-history. Update Purpose after archive.
## Requirements
### Requirement: Authenticated endpoint returns login history
The system SHALL expose `GET /auth/login-history` that returns the last 20 `login_event` records for the currently authenticated user, ordered by timestamp descending.

#### Scenario: Authenticated user fetches history
- **WHEN** an authenticated user calls `GET /auth/login-history`
- **THEN** the response is HTTP 200 with a JSON array of up to 20 `LoginEventDto` objects ordered by `createdAt` DESC

#### Scenario: Unauthenticated request rejected
- **WHEN** a request to `GET /auth/login-history` is made without a valid JWT
- **THEN** the response is HTTP 401

#### Scenario: User with no login events
- **WHEN** an authenticated user has no recorded login events
- **THEN** the response is HTTP 200 with an empty JSON array `[]`

### Requirement: LoginEventDto structure
Each item in the response SHALL contain: `id` (UUID), `createdAt` (ISO-8601 timestamp), `ipAddress` (string), `country` (string or null), `region` (string or null), `success` (boolean), `failureReason` (string or null).

#### Scenario: Successful event DTO
- **WHEN** a successful login event is returned
- **THEN** `success` is `true` and `failureReason` is `null`

#### Scenario: Failed event DTO
- **WHEN** a failed login event is returned
- **THEN** `success` is `false` and `failureReason` contains a non-null string (e.g., `BAD_CREDENTIALS`)

