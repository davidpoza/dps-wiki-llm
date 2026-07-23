# platform-foundation Specification

## Purpose
TBD - created by archiving change spring-angular-migration. Update Purpose after archive.
## Requirements
### Requirement: Dockerized multi-service stack

The system SHALL be deployable as a single Docker Compose stack containing a PostgreSQL 17 service (with the `pgvector` extension), a RabbitMQ service, the Spring Boot backend, the Angular frontend, and an nginx reverse proxy, on a shared Docker network.

#### Scenario: Full stack starts from compose

- **WHEN** an operator runs `docker compose up --build`
- **THEN** all services start, PostgreSQL and RabbitMQ report healthy via their healthchecks, and the backend waits for both to be healthy before starting

#### Scenario: Single entry point through nginx

- **WHEN** a client requests `/` or `/api/**` on the proxy port
- **THEN** nginx routes `/` to the frontend static assets and `/api/**` to the backend, and the SSE path is served with response buffering disabled

### Requirement: Backend application scaffold

The backend SHALL be a Spring Boot 3.3.x / Java 21 Maven application organized into `config`, `controllers`, `services`, `repositories`, `domain`, `dto`, and `mappers` packages, exposing all HTTP endpoints under the `/api` base path.

#### Scenario: Application boots with core starters

- **WHEN** the backend starts with a reachable database and broker
- **THEN** Spring Boot initializes web, data-jpa, amqp, validation, security, and actuator, and the OpenAPI UI is available

#### Scenario: Health endpoint reports readiness

- **WHEN** a client requests the Actuator health endpoint
- **THEN** the response reports `UP` only when the datasource and broker connections are available

### Requirement: Database schema migrations

The system SHALL manage the PostgreSQL schema exclusively through Flyway migrations under `backend/src/main/resources/db/migration`, and SHALL enable the `pgvector` extension as part of the baseline migration.

#### Scenario: Migrations apply on startup

- **WHEN** the backend starts against an empty database
- **THEN** Flyway applies all migrations in order, creates the `vector` extension, and the application fails fast if a migration is invalid

### Requirement: Configuration and secrets via environment

The system SHALL read all deployment configuration (database URL/credentials, RabbitMQ connection, LLM base URL / model / API key, Telegram token / allowed chat, vault path, CORS origins, log level) from environment variables, with no secrets committed to the repository.

#### Scenario: Provider-switchable configuration

- **WHEN** the LLM base URL, model, or API key environment variables change
- **THEN** the backend uses the new values on restart without code changes

#### Scenario: CORS restricted to configured origins

- **WHEN** a browser calls `/api/**` from an origin not in the configured allowlist
- **THEN** the backend rejects the cross-origin request

### Requirement: Angular signals frontend shell

The frontend SHALL be an Angular 21 application using standalone components and signal-based state services, built with pnpm and served as static assets behind nginx.

#### Scenario: Shell renders and reaches the API

- **WHEN** a user opens the proxy root URL
- **THEN** the Angular shell loads and its signal-based services successfully call `/api/**` through the same origin

### Requirement: Security configuration

The system SHALL use a stateless JWT filter chain. The current permit-all `SecurityFilterChain` SHALL be replaced with one that: disables sessions (`SessionCreationPolicy.STATELESS`), disables CSRF, adds the JWT filter before `UsernamePasswordAuthenticationFilter`, and exposes `AuthenticationManager` as a bean.

#### Scenario: Stateless session policy is applied

- **WHEN** the backend starts
- **THEN** the security filter chain uses `SessionCreationPolicy.STATELESS` and no session is created for any request

#### Scenario: Public paths remain accessible without token

- **WHEN** a request is made to `/api/auth/login` or `/actuator/health`
- **THEN** the request is processed without requiring an `Authorization` header

