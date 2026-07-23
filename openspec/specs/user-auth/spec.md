# user-auth Specification

## Purpose
TBD - created by archiving change user-auth-login. Update Purpose after archive.
## Requirements
### Requirement: User entity and persistence

The system SHALL store users in a `users` table with id, username, email, bcrypt-hashed password, roles (stored as a comma-separated string or JSON array), an `enabled` flag, and `created_at`/`updated_at` timestamps. The Flyway migration SHALL create this table and a unique index on `username` and `email`.

#### Scenario: User table is created on first run

- **WHEN** the backend starts against an empty database
- **THEN** Flyway applies the `users` migration and the table exists with all required columns

#### Scenario: Duplicate username is rejected

- **WHEN** a second user with an existing username is inserted
- **THEN** the database constraint rejects the insert

### Requirement: Password encoding

The system SHALL hash all passwords with BCrypt before storing them. Plain-text passwords SHALL never be persisted.

#### Scenario: Stored password is not plain text

- **WHEN** a user is created with password "secret"
- **THEN** the stored `password_hash` column value starts with `$2a$` and does not equal "secret"

### Requirement: Admin user seeded on startup

The system SHALL read `ADMIN_USERNAME` and `ADMIN_PASSWORD` from environment variables and create a user with the `ROLE_ADMIN` role on application startup if no user with that username already exists.

#### Scenario: Admin is created on first boot

- **WHEN** no user with the configured `ADMIN_USERNAME` exists
- **THEN** a new user is inserted with `ROLE_ADMIN` and the BCrypt-hashed password

#### Scenario: Admin seeding is idempotent

- **WHEN** the application restarts and the admin user already exists
- **THEN** no duplicate user is inserted

### Requirement: Admin-only user registration

The system SHALL expose `POST /api/auth/register` that accepts `{ username, email, password, roles }` and creates a new user. This endpoint SHALL require `ROLE_ADMIN` authorization. Non-admin requests SHALL receive `403 Forbidden`.

#### Scenario: Admin creates a new user

- **WHEN** an authenticated admin POSTs valid registration data to `/api/auth/register`
- **THEN** the system creates the user and returns `201 Created` with the user id and username

#### Scenario: Non-admin register attempt is rejected

- **WHEN** a non-admin authenticated user POSTs to `/api/auth/register`
- **THEN** the system returns `403 Forbidden`

#### Scenario: Duplicate username on register returns error

- **WHEN** an admin registers a username that already exists
- **THEN** the system returns `409 Conflict`

