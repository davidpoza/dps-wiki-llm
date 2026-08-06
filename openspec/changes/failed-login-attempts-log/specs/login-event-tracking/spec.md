## ADDED Requirements

### Requirement: Record attempted username on every event

Every `login_event` — successful or failed, password or 2FA — SHALL store the attempted username as a non-null value, so that a failed attempt can be attributed to the targeted account even when no `user` row is linked (for example, a wrong-password attempt that does not resolve to a user).

#### Scenario: Failed password attempt stores the attempted username

- **WHEN** a login to `POST /auth/login` fails with `BAD_CREDENTIALS`
- **THEN** the saved `login_event` has `username` set to the value submitted in the request and its `user` foreign key left null

#### Scenario: Every event has a non-null username

- **WHEN** any login attempt is recorded (successful or failed, password or 2FA)
- **THEN** the saved `login_event` has a non-null `username` field
