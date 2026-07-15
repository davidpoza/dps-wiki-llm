## Why

The application currently authenticates users with username + password only. Accounts with elevated roles (e.g. `ROLE_ADMIN`) that can trigger destructive Git/LLM operations benefit from a second authentication factor. We want to offer optional, self-service two-factor authentication (2FA) — off by default so existing users are unaffected — and give each user a place to manage it. Today there is no dedicated screen where a user can see who they are logged in as or manage their own account.

## What Changes

- Add a **user profile screen** reachable while logged in. Initial scope: show the current username, a **log out** button, and a **change password** action. This screen becomes the home for account settings, starting with 2FA.
- Add **self-service password change**: from the profile screen a user can change their own password by providing their current password and a new one.
- Add **optional TOTP-based 2FA** (compatible with standard authenticator apps such as Google Authenticator / Authy):
  - Disabled by default for every user; existing behavior is unchanged until a user opts in.
  - From the profile screen a user can **enable 2FA**: the backend generates a TOTP secret, the UI shows a QR code / secret, and the user confirms with a valid 6-digit code before it is activated.
  - A user can **disable 2FA** (re-authenticating / confirming with a current code).
  - **Login becomes two-step when 2FA is enabled**: after a valid username + password, the backend requires a valid TOTP code before issuing a JWT. Users without 2FA keep the current single-step login.
- Persist per-user 2FA state (enabled flag + secret) via a new DB migration.

## Capabilities

### New Capabilities
- `two-factor-auth`: Optional TOTP second factor — enrollment (enable/confirm), disable, and the two-step login verification flow. Off by default.
- `user-profile`: An authenticated profile screen showing the current user's identity and account actions (username, log out, change password) and hosting 2FA management.

### Modified Capabilities
<!-- No existing spec files in openspec/specs/ cover authentication, so login changes are captured within the new two-factor-auth capability. -->

## Impact

- **Backend** (`com.dpswikillm`):
  - `domain/User.java` + new migration `V10__two_factor.sql` (add `two_factor_enabled`, `two_factor_secret`).
  - `controllers/AuthController.java`: two-step login handling.
  - New `controllers` / `services` for 2FA enrollment (`/auth/2fa/...` endpoints) and a TOTP service.
  - `POST /auth/password` (or equivalent) for self-service password change in `AuthController` + `UserService`.
  - New DTOs (login challenge/verify, 2FA setup/confirm/disable, change-password).
  - New TOTP dependency (e.g. `dev.samstevens.totp`) in `backend/pom.xml`.
- **Frontend** (Angular):
  - New `profile.component.ts` + `/profile` route (guarded), including a change-password form.
  - `auth.service.ts` + `login.component.ts`: handle the 2FA challenge step.
  - New service methods for 2FA enable/confirm/disable and QR display.
  - i18n strings (`es`/`en`).
- **Security**: TOTP secrets stored server-side; login flow gains an intermediate verification state.
