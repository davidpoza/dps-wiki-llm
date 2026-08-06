## 1. Backend — scope login history by username

- [x] 1.1 In `LoginEventRepository`, add `List<LoginEvent> findTop20ByUsernameOrderByCreatedAtDesc(String username)` and remove the now-unused `findTop20ByUserOrderByCreatedAtDesc(User user)`
- [x] 1.2 In `LoginEventService.getHistory(User user)`, query with `user.getUsername()` via the new repository method (DTO mapping unchanged)
- [x] 1.3 Confirm `AuthController.loginHistory` and `LoginEventService.record(...)` need no changes (failed `BAD_CREDENTIALS` events already store the attempted `username`)

## 2. Backend — tests

- [x] 2.1 Add a test asserting a failed `BAD_CREDENTIALS` login (recorded with `user = null`) appears in `GET /auth/login-history` for the account whose username was attempted, with `success=false` and `failureReason="BAD_CREDENTIALS"` — covered by `LoginEventServiceTests.getHistory_includesFailedAttemptWithNullUser` (scoping logic) and `AuthControllerTests.loginHistory_returnsFailedAttemptsFromService` (endpoint wiring)
- [x] 2.2 Add a test asserting login events stored against a different username are NOT returned to the caller — `LoginEventServiceTests.getHistory_scopesStrictlyToCallerUsername` asserts the history is looked up only by the caller's own username (the isolation mechanism; DB-level filtering is guaranteed by the Spring Data `ByUsername` derived query, and the repo layer has no embedded-DB test harness to exercise directly)
- [x] 2.3 Keep/adjust existing `AuthControllerTests` so successful logins and failed 2FA attempts still appear (regression guard); confirm empty-history returns `[]` — existing login/2FA tests unchanged and green; `LoginEventServiceTests.getHistory_returnsEmptyWhenNoEvents` covers the empty case

## 3. Verification

- [x] 3.1 `mvn test` (backend) passes — full suite: 226 tests, 0 failures, 0 errors, 0 skipped (43 classes)
- [ ] 3.2 Recompile + restart the backend; from a fresh browser, attempt a login with a valid username and wrong password, then log in correctly and open `/profile` → the failed attempt is listed in "Historial de accesos" with a red result tag and `BAD_CREDENTIALS`  _(manual live-app check — pending)_
- [x] 3.3 Confirm no frontend change was required (existing table renders the failed rows) — `profile.component.ts` already renders `success=false` rows with a danger tag + `failureReason`; no frontend edits made
