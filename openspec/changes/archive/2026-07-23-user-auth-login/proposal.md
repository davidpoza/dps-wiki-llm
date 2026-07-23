## Why

The API is currently fully open — any request is permitted without authentication, making the system unsafe for deployment. A login system with Spring Security and database-backed users is needed so only authorized users can access the pipeline's endpoints.

## What Changes

- Add a `users` table (id, username, email, hashed password, roles, enabled flag, timestamps) with Flyway migration
- Add Spring Security HTTP Basic + session-based login: a `/api/auth/login` endpoint (POST, returns JWT), `/api/auth/logout`, and `/api/auth/me` (current user)
- Protect all `/api/**` endpoints (except `/api/auth/login` and health/docs) behind authentication
- Add an admin-seeded user from environment variables (`ADMIN_USERNAME`, `ADMIN_PASSWORD`) on first boot
- Add a `POST /api/auth/register` endpoint (admin-only) to create additional users
- Update `SecurityConfig` to use stateless JWT filter instead of permitting everything
- Update `.env.sample` with `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `JWT_SECRET`, `JWT_EXPIRATION_MS`
- Update CORS to allow the `Authorization` header

## Capabilities

### New Capabilities

- `user-auth`: User entity, repository, Flyway migration, password encoding, admin seeding on startup
- `jwt-security`: JWT token generation/validation, stateless filter chain, login/logout/me endpoints, role-based access

### Modified Capabilities

- `platform-foundation`: SecurityConfig changes from permit-all to JWT-protected; new env vars added

## Impact

- `backend/`: new domain (`User`, `Role`), repository, service, controller, JWT utility, updated `SecurityConfig`
- `frontend/`: login page component + auth interceptor (adds `Authorization: Bearer <token>` header to all requests)
- `.env.sample`: three new variables (`ADMIN_USERNAME`, `ADMIN_PASSWORD`, `JWT_SECRET`)
- All existing API calls from the frontend will require a valid JWT token
