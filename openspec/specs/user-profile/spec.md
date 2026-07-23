# user-profile Specification

## Purpose
TBD - created by archiving change optional-2fa-profile. Update Purpose after archive.
## Requirements
### Requirement: Authenticated profile screen

The application SHALL provide a profile screen accessible only to authenticated users. Unauthenticated access MUST be redirected to login.

#### Scenario: Authenticated user opens profile

- **WHEN** a logged-in user navigates to the profile route
- **THEN** the profile screen is displayed

#### Scenario: Unauthenticated access is blocked

- **WHEN** an unauthenticated user navigates to the profile route
- **THEN** the user is redirected to the login screen

### Requirement: Profile shows current username

The profile screen SHALL display the username of the currently authenticated user.

#### Scenario: Username is shown

- **WHEN** the profile screen is displayed for a logged-in user
- **THEN** the current user's username is visible

### Requirement: Profile provides log out

The profile screen SHALL provide a log out action that ends the session and returns the user to the login screen.

#### Scenario: User logs out from profile

- **WHEN** the user activates the log out button on the profile screen
- **THEN** the session token is cleared and the user is redirected to the login screen

### Requirement: Profile provides change password

The profile screen SHALL let the authenticated user change their own password. The system MUST require the current password and MUST reject the change if the current password is incorrect.

#### Scenario: Change password with valid current password

- **WHEN** the user submits their correct current password and a valid new password
- **THEN** the system updates the stored password hash and confirms success

#### Scenario: Change password with incorrect current password

- **WHEN** the user submits an incorrect current password
- **THEN** the system rejects the request and the password is unchanged

#### Scenario: New password fails validation

- **WHEN** the user submits a new password that does not meet the password requirements
- **THEN** the system rejects the request and reports the validation error

### Requirement: Profile hosts 2FA management

The profile screen SHALL let the user view their current 2FA status and enable or disable it from within the profile.

#### Scenario: 2FA status is visible

- **WHEN** the profile screen is displayed
- **THEN** it shows whether 2FA is currently enabled or disabled with the appropriate action (enable or disable)

#### Scenario: Enable flow shows QR and confirmation

- **WHEN** a user with 2FA disabled starts enabling it from the profile
- **THEN** the screen displays the QR code / secret and prompts for a 6-digit code to confirm activation

