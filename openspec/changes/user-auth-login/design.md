## Context

The backend currently has Spring Security on the classpath but configured as permit-all. There is no user concept, no token mechanism, and no login endpoint. The frontend makes all API calls without an `Authorization` header.

The stack is Spring Boot 3.3 / Java 21. `spring-boot-starter-security` is already a dependency. The JWT library to add is `io.jsonwebtoken:jjwt-api` + `jjwt-impl` + `jjwt-jackson` (JJWT 0.12.x).

## Goals / Non-Goals

**Goals:**
- Stateless JWT authentication on all `/api/**` endpoints except `/api/auth/login`
- User CRUD backed by the existing PostgreSQL database (new Flyway migration)
- BCrypt password hashing via Spring Security's `BCryptPasswordEncoder`
- Admin user seeded from env on startup
- Admin-only `POST /api/auth/register`
- Angular login page with auth interceptor

**Non-Goals:**
- OAuth2 / social login
- Refresh tokens (single access token per login is sufficient for now)
- Password reset / email flows
- Fine-grained resource-level authorization (role-based endpoint guards only)
- Rate limiting on the login endpoint

## Decisions

### D1: JWT over sessions

**Decision:** Stateless JWT (no `HttpSession`).

**Rationale:** The API is already consumed by a SPA and a Telegram bot. Sessions would require sticky routing or a session store; JWT is self-contained and pairs naturally with `Authorization: Bearer` headers. The existing SSE endpoint (`/api/jobs/events`) works with JWT — the browser sends the header on the initial `EventSource` connection if we use a custom EventSource wrapper (or pass the token as a query param for SSE).

**Alternative considered:** Spring Security sessions with CSRF. Rejected — CSRF is already disabled and sessions add operational complexity.

### D2: JJWT 0.12.x library

**Decision:** Use `io.jsonwebtoken:jjwt-api:0.12.3` + `jjwt-impl` + `jjwt-jackson`.

**Rationale:** JJWT is the de-facto standard JWT library for Java/Spring; 0.12.x has the modern fluent builder API. It's a compile-time dependency only (`jjwt-impl` is `runtime`).

**Alternative considered:** Nimbus JOSE + JWT (used by Spring Security OAuth2). Overkill for simple symmetric HMAC-SHA256 tokens.

### D3: HS256 with a configurable secret

**Decision:** Sign tokens with HMAC-SHA256 (`HS256`) using a `JWT_SECRET` env var (≥ 256-bit base64 string). Expiry from `JWT_EXPIRATION_MS` (default 86400000 = 24h).

**Rationale:** Asymmetric keys (RS256) are justified when multiple services verify tokens. Here there is one issuer and one verifier (the backend), so symmetric is simpler and sufficient.

### D4: SSE token delivery

**Decision:** The Angular `JobsStore` EventSource will pass the JWT as a query parameter `/api/jobs/events?token=<jwt>` and the backend will read it from the query string in the JWT filter for SSE requests only.

**Rationale:** The browser `EventSource` API does not support custom headers. Query-param tokens are acceptable for SSE because (a) HTTPS encrypts the URL, (b) SSE is read-only, and (c) the token is short-lived.

### D5: User roles

**Decision:** Two roles: `ROLE_USER` (default) and `ROLE_ADMIN`. Stored as a comma-separated string in a `roles` column.

**Rationale:** Simple and avoids a separate roles table. Sufficient for this change — only one admin-only endpoint (`/api/auth/register`).

## Risks / Trade-offs

- **JWT_SECRET exposure** → Store in `.env` (gitignored) and inject via Docker env. The secret must be ≥ 256 bits to resist brute force.
- **No token revocation** → A stolen token is valid until expiry. Mitigation: keep expiry short (24h default). Refresh tokens are a future change.
- **SSE token in query param** → Logged by some proxies. Mitigation: HTTPS-only deployment; token is short-lived.
- **Bootstrap problem** → If `ADMIN_USERNAME`/`ADMIN_PASSWORD` are not set, the seeder logs a warning and skips. The system still starts, but no admin account exists and no user can be created via API. Document clearly in `.env.sample`.

## Migration Plan

1. Add JJWT dependencies to `pom.xml`
2. Run Flyway migration to create `users` table
3. Deploy with `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `JWT_SECRET` set
4. Frontend ships login page; all protected API calls add the Bearer token
5. **No data migration needed** — the `users` table is new

**Rollback:** Revert `SecurityConfig` to permit-all, drop the `users` table, redeploy without the JWT filter.

## Open Questions

- Should the Angular login page redirect to `/` after login, or remember the last attempted route? (Recommend: remember last route via `ActivatedRoute` snapshot — implement in frontend task.)
- Should the SSE EventSource token query-param approach use `token` or `access_token` as the param name? (Recommend: `token` — shorter and not confused with OAuth2 flows.)
