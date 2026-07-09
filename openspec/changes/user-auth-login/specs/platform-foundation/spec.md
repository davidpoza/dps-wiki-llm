## MODIFIED Requirements

### Requirement: Security configuration

The system SHALL use a stateless JWT filter chain. The current permit-all `SecurityFilterChain` SHALL be replaced with one that: disables sessions (`SessionCreationPolicy.STATELESS`), disables CSRF, adds the JWT filter before `UsernamePasswordAuthenticationFilter`, and exposes `AuthenticationManager` as a bean.

#### Scenario: Stateless session policy is applied

- **WHEN** the backend starts
- **THEN** the security filter chain uses `SessionCreationPolicy.STATELESS` and no session is created for any request

#### Scenario: Public paths remain accessible without token

- **WHEN** a request is made to `/api/auth/login` or `/actuator/health`
- **THEN** the request is processed without requiring an `Authorization` header
