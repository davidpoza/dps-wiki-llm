## Context

The backend is Spring Boot with Spring Security + JWT (`AuthController`, `JwtUtil`, `JwtAuthFilter`, `UserService implements UserDetailsService`). The `User` entity maps to the `users` table (Flyway migrations, latest `V9`). Login today is single-step: `POST /auth/login` authenticates via `AuthenticationManager` and returns an `AuthResponse` (token, expiry, username, roles).

The frontend is standalone-component Angular with signal-based `AuthService` (token/user in `localStorage`), route guards (`authGuard`), PrimeNG UI, and Transloco i18n (`es`/`en`). Routes are declared inline in `main.ts`. A logout button already exists in several component headers.

There is no per-user account screen and no second authentication factor.

## Goals / Non-Goals

**Goals:**
- Optional, self-service TOTP 2FA, disabled by default, that does not change login for users who don't enable it.
- A guarded `/profile` screen showing username + logout, hosting 2FA enable/disable.
- Standard authenticator-app compatibility (RFC 6238 TOTP, otpauth URI + QR).
- Backward-compatible login API: single-step remains valid when 2FA is off.

**Non-Goals:**
- SMS/email OTP, WebAuthn/passkeys, or push-based factors.
- Backup/recovery codes (can be a follow-up).
- Admin-enforced/mandatory 2FA policies.
- Encrypting the TOTP secret at rest with a KMS (stored as-is in DB for now; see Risks).
- Rich profile editing (email/password change) beyond username display + logout.

## Decisions

### TOTP over other second factors
Use RFC 6238 TOTP via the `dev.samstevens.totp` library. It provides secret generation, otpauth URI/QR generation, and code verification with a configurable time-step window.
- **Alternatives:** hand-rolled HMAC-based TOTP (more code, more risk of bugs); WebAuthn (better security but heavier client/server integration and hardware dependency). TOTP is the lowest-friction option that works with apps users already have.

### Two-step login via a short-lived challenge token
When password auth succeeds and the user has 2FA enabled, `POST /auth/login` returns `200` with `{ twoFactorRequired: true, challengeToken }` instead of a JWT. The client then calls `POST /auth/login/2fa` with `{ challengeToken, code }` to get the real `AuthResponse`.
- The `challengeToken` is a short-lived (e.g. 5 min) signed JWT carrying the username and a `"scope": "2fa"` claim — it is **not** accepted by `JwtAuthFilter` for API access.
- **Alternatives:** stash pending-auth state server-side in a session/cache (adds stateful storage, breaks the current stateless model); send the TOTP code in the initial login body (worse UX — client can't know in advance that 2FA is required, and mixes concerns). A signed challenge token keeps the server stateless and reuses `JwtUtil`.

### Data model: two columns on `users`
Add `two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE` and `two_factor_secret VARCHAR(255) NULL` in migration `V10__two_factor.sql`, mapped on `User`. A null/absent secret with `enabled = false` is the default state. During enrollment the secret is stored but `enabled` stays false until confirmation; on disable, the secret is cleared and `enabled` set false.
- **Alternatives:** a separate `user_two_factor` table (unnecessary 1:1 split for two columns).

### Enrollment endpoints (authenticated)
- `POST /auth/2fa/setup` → generates + persists a pending secret, returns `{ secret, otpauthUri }`.
- `POST /auth/2fa/confirm` `{ code }` → validates against pending secret, sets `enabled = true`.
- `POST /auth/2fa/disable` `{ code }` → validates current code, clears secret + `enabled = false`.
- `GET /auth/me` extended to include `twoFactorEnabled` so the profile can render status.

### Self-service password change
- `POST /auth/password` `{ currentPassword, newPassword }` (authenticated) → verifies `currentPassword` against the stored hash via `PasswordEncoder`, applies bean-validation to `newPassword`, and updates the hash in `UserService`. Rejects with `400`/`401` on invalid current password or failed validation. Reuses the existing `PasswordEncoder`; no new dependency.

### Frontend
- New `profile.component.ts`, route `{ path: 'profile', component: ProfileComponent, canActivate: [authGuard] }` in `main.ts`.
- `AuthService.login` returns a discriminated result: either logged-in, or `{ twoFactorRequired, challengeToken }`; add `verifyTwoFactor(challengeToken, code)`. `login.component.ts` renders a second code-entry step when challenged.
- Add `TwoFactorService` (or extend `AuthService`) for setup/confirm/disable; render QR from the otpauth URI (PrimeNG + a QR generator, or a backend-rendered data-URI to avoid a new frontend dep — decide during apply).
- i18n keys added to `es.json`/`en.json`.

## Risks / Trade-offs

- **TOTP secret stored in plaintext in DB** → Mitigation: restrict DB access; document as a known limitation and a candidate follow-up to encrypt at rest. Acceptable for current threat model where DB is already trusted infrastructure.
- **Challenge token misused as an access token** → Mitigation: distinct `scope: "2fa"` claim; `JwtAuthFilter` rejects tokens whose scope is not the normal access scope; short TTL.
- **Clock drift between server and authenticator** → Mitigation: allow a ±1 time-step verification window (library default), documented.
- **Lockout if the user loses their authenticator** (no recovery codes in scope) → Mitigation: an admin can disable a user's 2FA out-of-band; note recovery codes as a follow-up.
- **New backend dependency (`dev.samstevens.totp`)** → Mitigation: small, well-scoped, widely used; pin the version.

## Migration Plan

1. Add Flyway `V10__two_factor.sql` (nullable secret + boolean default false) — non-breaking, all existing users default to 2FA off.
2. Deploy backend with new endpoints and two-step login logic (single-step remains valid).
3. Deploy frontend with profile screen and challenge handling.
4. Rollback: revert app deploy; the `V10` columns are additive and harmless if left in place (feature simply goes unused).

## Open Questions

- QR rendering location: backend-rendered data URI (no new frontend dependency) vs. frontend QR library — resolve during apply.
- Should `GET /auth/me` be the single source for `twoFactorEnabled`, or also include it in the post-login `AuthResponse`? Leaning on `/auth/me` to keep `AuthResponse` stable.
