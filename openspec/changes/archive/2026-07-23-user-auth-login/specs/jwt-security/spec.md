## ADDED Requirements

### Requirement: JWT login endpoint

The system SHALL expose `POST /api/auth/login` that accepts `{ username, password }` and returns a signed JWT access token on success. This endpoint SHALL be publicly accessible (no authentication required).

#### Scenario: Valid credentials return a token

- **WHEN** a POST to `/api/auth/login` is made with correct username and password
- **THEN** the system returns `200 OK` with `{ token, expiresAt, username, roles }`

#### Scenario: Invalid credentials return 401

- **WHEN** a POST to `/api/auth/login` is made with wrong password or unknown username
- **THEN** the system returns `401 Unauthorized` with no token

#### Scenario: Disabled user is rejected at login

- **WHEN** a user with `enabled = false` attempts to log in
- **THEN** the system returns `401 Unauthorized`

### Requirement: JWT token validation filter

The system SHALL validate the `Authorization: Bearer <token>` header on every request to protected endpoints. Requests with a missing, expired, or invalid token SHALL receive `401 Unauthorized`. Requests with a valid token SHALL have the user's roles injected into the Spring Security context.

#### Scenario: Valid token grants access

- **WHEN** a request carries a valid unexpired JWT in the `Authorization` header
- **THEN** the request proceeds and the endpoint returns its normal response

#### Scenario: Expired token is rejected

- **WHEN** a request carries a JWT whose `exp` claim is in the past
- **THEN** the system returns `401 Unauthorized`

#### Scenario: Tampered token is rejected

- **WHEN** a request carries a JWT with an invalid signature
- **THEN** the system returns `401 Unauthorized`

#### Scenario: Missing token on protected endpoint returns 401

- **WHEN** a request is made to a protected endpoint without an `Authorization` header
- **THEN** the system returns `401 Unauthorized`

### Requirement: Current-user endpoint

The system SHALL expose `GET /api/auth/me` that returns the authenticated user's `{ id, username, email, roles }`. This endpoint SHALL require authentication.

#### Scenario: Authenticated user retrieves own profile

- **WHEN** an authenticated request is made to `GET /api/auth/me`
- **THEN** the system returns `200 OK` with the calling user's profile

### Requirement: Public and protected endpoint configuration

The system SHALL permit unauthenticated access to: `POST /api/auth/login`, `GET /actuator/health/**`, `/v3/api-docs/**`, `/swagger-ui/**`. All other `/api/**` requests SHALL require a valid JWT.

#### Scenario: Health endpoint is accessible without token

- **WHEN** a request is made to `/actuator/health` without authentication
- **THEN** the system returns `200 OK`

#### Scenario: Protected endpoint without token returns 401

- **WHEN** a request is made to `GET /api/jobs/events` without an `Authorization` header
- **THEN** the system returns `401 Unauthorized`

### Requirement: Stateless JWT session

The system SHALL be stateless — no HTTP session is created or used for authentication. Each request is authenticated independently via the JWT.

#### Scenario: No session cookie is set after login

- **WHEN** a login response is received
- **THEN** no `Set-Cookie: JSESSIONID` header is present in the response
