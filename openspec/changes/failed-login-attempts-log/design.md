## Context

Login auditing already exists end-to-end:

- **Recording** — `AuthController` calls `LoginEventService.record(...)` on every login path. Successful logins and failed 2FA attempts are recorded with the resolved `User`; failed password attempts on `POST /auth/login` are recorded with `user = null` but with the attempted `username` (see `AuthController.login`, `record(null, request.username(), httpRequest, false, "BAD_CREDENTIALS")`). Every `login_event` row already has a non-null `username` column.
- **Read API** — `GET /auth/login-history` → `LoginEventService.getHistory(user)` → `LoginEventRepository.findTop20ByUserOrderByCreatedAtDesc(user)`.
- **UI** — `ProfileComponent` already renders a "Historial de accesos" table that shows `success=false` rows with a red PrimeNG tag plus the `failureReason`.

The defect: the read API filters strictly by the `user` foreign key, but the most security-relevant failures (wrong-password attempts) are stored with `user = null`. Those rows exist in the database but are invisible to the account owner. The result contradicts the intent of `login-event-tracking` (which records failed password logins) combined with `login-history-api` (whose "Failed event DTO" scenario implies failures are visible).

## Goals / Non-Goals

**Goals:**

- Surface failed login attempts (especially `BAD_CREDENTIALS`) in the `/profile` login-history table.
- Keep the change read-side only, with no change to the recording path and no database migration.
- Guarantee the account owner sees only attempts made against their own username — no cross-account leakage.

**Non-Goals:**

- No frontend changes; the existing table already renders failures.
- No change to how events are recorded (`record(...)` and `AuthController` stay as-is).
- No new alerting/lockout/rate-limiting on failed attempts (out of scope; this is visibility only).
- No case-insensitive username matching or username-history/aliasing handling.

## Decisions

### Decision 1: Scope the history lookup by username, not by the `user` foreign key

Change `LoginEventService.getHistory(User user)` to query by `user.getUsername()` and add `LoginEventRepository.findTop20ByUsernameOrderByCreatedAtDesc(String username)`. The old `findTop20ByUserOrderByCreatedAtDesc(User)` becomes unused and is removed.

**Why:** every `login_event` (success or failure) already stores the attempted `username` as a non-null column, whereas the `user` FK is null for `BAD_CREDENTIALS` failures. Querying by username naturally includes those orphaned failures — and also surfaces historical rows already in the database, with zero write-path changes and no migration. Usernames are unique (`UserRepository.existsByUsername` / `findByUsername`), so matching by username is equivalent to matching the account, with no risk of returning another account's rows.

**Alternative considered:** look up the `User` on the failure path in `AuthController` and set the FK so the existing by-FK query works. Rejected — it adds a DB lookup on every failed login, complicates the failure/catch path, would not retroactively fix rows already stored with a null FK, and (depending on framing) risks leaking user existence into the failure path. The read-side fix is smaller and strictly better.

### Decision 2: Keep the `getHistory(User)` signature

`AuthController.loginHistory` continues to pass the authenticated `@AuthenticationPrincipal User`. `getHistory` derives the username internally (`user.getUsername()`), so the controller and DTO mapping are untouched. This keeps the blast radius to the service + repository.

### Decision 3: No frontend change

The profile table already renders `success=false` with a danger tag and the `failureReason` (`profile.component.ts`), and `AuthService.fetchLoginHistory()` is unchanged because the endpoint contract (shape and ordering) is unchanged — only the set of returned rows grows. Nothing on the client needs to change.

## Risks / Trade-offs

- **Exact-match username** → an attacker typing the username with different casing/whitespace would be recorded under that literal string and might not match the owner's canonical username, so such a row could be missed in the owner's history. Mitigation: acceptable for v1 (login itself is exact-match, so these are edge cases); case-insensitive matching is a possible later refinement, noted as a non-goal.
- **Query performance on `username`** → the ordered top-20 lookup runs against `login_events.username`, which is not indexed today. Mitigation: table volume is tiny; an optional `(username, created_at)` index can be added later if needed. Not required now.
- **More rows now visible to users** → failed attempts (including noisy automated probing against a username) will appear in the table. This is the intended security signal, not a regression; the table already caps at 20 rows ordered by recency.

## Migration Plan

Backend-only, no data migration:

1. Add `findTop20ByUsernameOrderByCreatedAtDesc(String username)` to `LoginEventRepository` and remove the unused `findTop20ByUserOrderByCreatedAtDesc(User)`.
2. Update `LoginEventService.getHistory(User)` to call the new method with `user.getUsername()`.
3. Recompile and restart the backend (no schema change; existing rows immediately become visible).

Rollback: revert the service + repository change; no schema or data impact.

## Open Questions

- Should the history be case-insensitive on username to catch mixed-case probing, or stay exact-match? (Design defaults to exact-match for v1.)
