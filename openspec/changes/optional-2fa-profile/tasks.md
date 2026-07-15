## 1. Backend data model & dependency

- [x] 1.1 Add `dev.samstevens.totp` dependency to `backend/pom.xml` (pinned version)
- [x] 1.2 Create Flyway migration `V10__two_factor.sql` adding `two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE` and `two_factor_secret VARCHAR(255) NULL` to `users`
- [x] 1.3 Add `twoFactorEnabled` and `twoFactorSecret` fields + accessors to `domain/User.java` (defaults: disabled, null secret)

## 2. Backend TOTP service

- [x] 2.1 Create `TotpService` wrapping secret generation, otpauth URI generation, and code verification (±1 time-step window)
- [x] 2.2 Add unit tests for `TotpService` (valid code passes, wrong/expired code fails, generated secret verifies)

## 3. Backend 2FA enrollment endpoints

- [x] 3.1 Add DTOs: setup response (`secret`, `otpauthUri`), confirm request (`code`), disable request (`code`)
- [x] 3.2 `POST /auth/2fa/setup` — generate + persist pending secret, return secret + otpauth URI (authenticated)
- [x] 3.3 `POST /auth/2fa/confirm` — verify code against pending secret, set `two_factor_enabled = true`
- [x] 3.4 `POST /auth/2fa/disable` — verify current code, clear secret and set `two_factor_enabled = false`
- [x] 3.5 Extend `GET /auth/me` to include `twoFactorEnabled`
- [x] 3.6 Add change-password DTO (`currentPassword`, `newPassword` with validation) and `POST /auth/password` — verify current password via `PasswordEncoder`, update hash in `UserService`; add tests (valid change, wrong current password, invalid new password)

## 4. Backend two-step login

- [x] 4.1 Add a short-lived `scope: "2fa"` challenge token to `JwtUtil` (generate + validate scope)
- [x] 4.2 Ensure `JwtAuthFilter` rejects challenge-scoped tokens for API access
- [x] 4.3 Modify `POST /auth/login`: if user has 2FA enabled, return `{ twoFactorRequired: true, challengeToken }` instead of a JWT; otherwise unchanged
- [x] 4.4 Add `POST /auth/login/2fa` — validate challenge token + TOTP code, then issue the real `AuthResponse`
- [x] 4.5 Add controller/service tests: 2FA-off single-step login, 2FA-on challenge+verify, invalid code rejected, bad password never reaches challenge

## 5. Frontend profile screen

- [x] 5.1 Create `profile.component.ts` showing current username and a log out button
- [x] 5.2 Register guarded `{ path: 'profile', canActivate: [authGuard] }` route in `main.ts` and add navigation to it
- [x] 5.3 Wire log out to `AuthService.logout()` + redirect to `/login`
- [x] 5.4 Add a change-password form (current + new password) that calls `POST /auth/password` and shows success/error feedback

## 6. Frontend 2FA management (in profile)

- [x] 6.1 Add `TwoFactorService` (or extend `AuthService`): `setup()`, `confirm(code)`, `disable(code)`, and read status from `/auth/me`
- [x] 6.2 Show current 2FA status (enabled/disabled) on the profile screen
- [x] 6.3 Enable flow: call setup, render QR code / secret from otpauth URI, prompt for 6-digit code, call confirm
- [x] 6.4 Disable flow: prompt for current code, call disable, refresh status

## 7. Frontend two-step login

- [x] 7.1 Update `AuthService.login` to return either logged-in or `{ twoFactorRequired, challengeToken }`; add `verifyTwoFactor(challengeToken, code)`
- [x] 7.2 Update `login.component.ts` to render a second code-entry step when challenged and complete login on success
- [x] 7.3 Handle invalid-code error messaging on the second step

## 8. i18n & verification

- [x] 8.1 Add `es`/`en` i18n strings for profile, change password, 2FA setup/confirm/disable, and login challenge
- [ ] 8.2 Manual E2E: enable 2FA, log out, log in with second factor, disable 2FA, confirm single-step login restored
