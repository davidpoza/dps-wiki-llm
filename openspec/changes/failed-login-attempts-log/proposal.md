## Why

Failed login attempts are already persisted by the backend, and the profile screen already renders a "Historial de accesos" table — but the most important failures (wrong-password attempts on `POST /auth/login`) are stored with a `null` user foreign key, while the history endpoint queries strictly by that foreign key. As a result an account owner never sees that someone tried and failed to log into their account, which defeats the security purpose of the login history.

## What Changes

- Scope the login-history lookup by the **account username** instead of the `user` foreign key, so failed attempts recorded against a username (which have no `user` FK) surface in that account's history. Successful logins and failed 2FA attempts keep appearing as before.
- Guarantee at the spec level that every login event — success or failure — stores the **attempted username**, which is what makes the by-username lookup well-founded and lets a failed attempt be attributed to the targeted account.
- No frontend changes: the existing profile "Historial de accesos" table already renders `success=false` rows with a red indicator and the failure reason, so failed attempts appear automatically once the API returns them.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `login-history-api`: The last-20 login history is scoped to the authenticated user's **username** — all events recorded against that username, including failed attempts that have no linked `user` row — rather than only events linked through the `user` foreign key.
- `login-event-tracking`: Every recorded login event, including failed password attempts, SHALL store the attempted username so it can be attributed to the targeted account.

## Impact

- **Backend (Spring Boot)**:
  - `LoginEventRepository`: add `findTop20ByUsernameOrderByCreatedAtDesc(String username)`; the previous `findTop20ByUserOrderByCreatedAtDesc(User)` becomes unused and is removed.
  - `LoginEventService.getHistory(User)`: query by `user.getUsername()` instead of by the `User` entity.
  - No change to the recording path (`LoginEventService.record(...)`) or to `AuthController` — failed `BAD_CREDENTIALS` events already store the attempted username.
- **Frontend (Angular)**: none. `ProfileComponent`, `AuthService.fetchLoginHistory()`, and the history table are unchanged.
- **Database**: no schema migration; the `login_events.username` column already exists and is non-null. (Optional: a `(username, created_at)` index for the ordered lookup — not required at current data volumes.)
- **API contract**: `GET /auth/login-history` response shape is unchanged; only which rows it includes changes.
