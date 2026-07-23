# two-factor-auth Specification

## Purpose
TBD - created by archiving change optional-2fa-profile. Update Purpose after archive.
## Requirements
### Requirement: 2FA is disabled by default

Every user account SHALL have two-factor authentication disabled by default. Existing accounts and newly created accounts MUST be able to authenticate with username and password alone until the user explicitly enables 2FA.

#### Scenario: Existing user logs in without 2FA

- **WHEN** a user who has never enabled 2FA submits a valid username and password
- **THEN** the system issues a JWT immediately without requesting a second factor

#### Scenario: New account starts with 2FA off

- **WHEN** an administrator creates a new user
- **THEN** that user's 2FA state is disabled and no TOTP secret is stored

### Requirement: User can enroll in 2FA

An authenticated user SHALL be able to start 2FA enrollment. The system MUST generate a TOTP secret compatible with standard authenticator apps and return provisioning data (secret and an otpauth URI / QR code) without yet activating 2FA.

#### Scenario: Begin enrollment

- **WHEN** an authenticated user requests to enable 2FA
- **THEN** the system generates a new TOTP secret, stores it in a pending state, and returns the secret and an otpauth provisioning URI for QR display

#### Scenario: Enrollment does not activate until confirmed

- **WHEN** enrollment has started but no valid code has been confirmed
- **THEN** the user's 2FA remains disabled and login still requires only username and password

### Requirement: User must confirm a TOTP code to activate 2FA

The system SHALL require a valid current 6-digit TOTP code before activating 2FA. Activation MUST fail if the code is invalid or expired.

#### Scenario: Confirm with valid code

- **WHEN** the user submits a valid TOTP code that matches the pending secret
- **THEN** the system marks 2FA as enabled for that user

#### Scenario: Confirm with invalid code

- **WHEN** the user submits an incorrect or expired TOTP code
- **THEN** the system rejects the request, 2FA remains disabled, and the pending secret is not activated

### Requirement: Login requires a second factor when 2FA is enabled

When a user has 2FA enabled, the system SHALL NOT issue a JWT on username/password alone. It MUST first return a challenge indicating a second factor is required, then issue the JWT only after a valid TOTP code is provided.

#### Scenario: Password step returns a challenge

- **WHEN** a user with 2FA enabled submits a valid username and password
- **THEN** the system responds with a challenge indicating a TOTP code is required and does not issue a JWT

#### Scenario: Valid second factor completes login

- **WHEN** the user answers the challenge with a valid TOTP code
- **THEN** the system issues a JWT with the user's roles

#### Scenario: Invalid second factor is rejected

- **WHEN** the user answers the challenge with an incorrect or expired TOTP code
- **THEN** the system denies authentication and does not issue a JWT

#### Scenario: Invalid password never reaches the second factor

- **WHEN** a user with 2FA enabled submits an incorrect password
- **THEN** the system returns an invalid-credentials error without revealing the 2FA challenge

### Requirement: User can disable 2FA

An authenticated user with 2FA enabled SHALL be able to disable it. The system MUST require proof of possession (a valid current TOTP code) before disabling, and MUST discard the stored secret when disabled.

#### Scenario: Disable with valid code

- **WHEN** a user with 2FA enabled submits a request to disable 2FA with a valid current TOTP code
- **THEN** the system disables 2FA, clears the stored secret, and subsequent logins require only username and password

#### Scenario: Disable rejected without valid code

- **WHEN** a user requests to disable 2FA with a missing or invalid TOTP code
- **THEN** the system rejects the request and 2FA remains enabled

