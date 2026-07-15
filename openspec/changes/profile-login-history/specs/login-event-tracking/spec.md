## ADDED Requirements

### Requirement: Record login attempt on every authentication
The system SHALL persist a `login_event` record for every login attempt, whether successful or failed, including 2FA verification attempts.

#### Scenario: Successful password login recorded
- **WHEN** a user submits valid credentials to `POST /auth/login` and does not require 2FA
- **THEN** a `login_event` is saved with `success=true`, the user's IP, geolocation (country/region), and current timestamp

#### Scenario: Failed password login recorded
- **WHEN** a user submits invalid credentials to `POST /auth/login`
- **THEN** a `login_event` is saved with `success=false`, failure reason `BAD_CREDENTIALS`, the requesting IP, geolocation, and current timestamp

#### Scenario: Successful 2FA login recorded
- **WHEN** a user successfully completes `POST /auth/login/2fa` with a valid TOTP code
- **THEN** a `login_event` is saved with `success=true`, the user's IP, geolocation, and current timestamp

#### Scenario: Failed 2FA login recorded
- **WHEN** a user submits an invalid TOTP code to `POST /auth/login/2fa`
- **THEN** a `login_event` is saved with `success=false`, failure reason `INVALID_2FA_CODE`, the requesting IP, geolocation, and current timestamp

### Requirement: Extract client IP behind proxy
The system SHALL resolve the client IP from the `X-Forwarded-For` header (first value) when present, falling back to `HttpServletRequest.getRemoteAddr()`.

#### Scenario: Request via proxy
- **WHEN** the request contains `X-Forwarded-For: 1.2.3.4, 10.0.0.1`
- **THEN** the recorded IP is `1.2.3.4`

#### Scenario: Direct request without proxy header
- **WHEN** the request does not contain `X-Forwarded-For`
- **THEN** the recorded IP is the value of `HttpServletRequest.getRemoteAddr()`

### Requirement: Resolve geolocation from IP
The system SHALL attempt to resolve the country and region for the client IP using an embedded GeoLite2 database.

#### Scenario: Known IP resolved
- **WHEN** the client IP is present in the GeoLite2 database
- **THEN** the `login_event` is saved with non-null `country` and `region` fields

#### Scenario: Unknown or private IP
- **WHEN** the client IP cannot be resolved (private range or not in database)
- **THEN** the `login_event` is saved with `country=null` and `region=null`, without throwing an error
