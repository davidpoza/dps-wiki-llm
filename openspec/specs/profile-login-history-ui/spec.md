# profile-login-history-ui Specification

## Purpose
TBD - created by archiving change profile-login-history. Update Purpose after archive.
## Requirements
### Requirement: Login history section in profile screen
The profile screen SHALL display a "Historial de accesos" section below the existing 2FA section, containing a table with the user's last 20 login events.

#### Scenario: Section visible on profile load
- **WHEN** the user navigates to the profile screen
- **THEN** the "Historial de accesos" section is visible and loads automatically on init

#### Scenario: Table shows all required columns
- **WHEN** login history data is loaded
- **THEN** the table displays columns: Fecha/Hora, IP, País, Región, Resultado

#### Scenario: Successful login displayed with success indicator
- **WHEN** a login event has `success=true`
- **THEN** the Resultado cell shows a green success indicator (e.g., badge or icon)

#### Scenario: Failed login displayed with failure indicator
- **WHEN** a login event has `success=false`
- **THEN** the Resultado cell shows a red failure indicator and the `failureReason` value

#### Scenario: Loading state
- **WHEN** the history is being fetched
- **THEN** the table shows a loading skeleton or spinner

#### Scenario: Empty state
- **WHEN** the user has no login events
- **THEN** the table shows an empty state message

#### Scenario: Null geolocation displayed gracefully
- **WHEN** a login event has `country=null` or `region=null`
- **THEN** the corresponding cell displays a dash (`—`) instead of blank

### Requirement: Login history fetched via AuthService
The `AuthService` SHALL expose a `fetchLoginHistory()` method that calls `GET /auth/login-history` and returns a typed array of `LoginEvent` objects.

#### Scenario: Service method returns typed data
- **WHEN** `fetchLoginHistory()` is called
- **THEN** it returns a `Promise<LoginEvent[]>` with the response from the backend

