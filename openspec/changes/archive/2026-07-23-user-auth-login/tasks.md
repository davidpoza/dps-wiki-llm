## 1. Dependencies & database (backend)

- [x] 1.1 Add JJWT 0.12.x dependencies to `backend/pom.xml` (`jjwt-api` compile, `jjwt-impl` + `jjwt-jackson` runtime)
- [x] 1.2 Add `JWT_SECRET`, `JWT_EXPIRATION_MS`, `ADMIN_USERNAME`, `ADMIN_PASSWORD` to `.env.sample` and `AppProperties`
- [x] 1.3 Flyway migration: `CREATE TABLE users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), username VARCHAR(80) UNIQUE NOT NULL, email VARCHAR(255) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL, roles VARCHAR(255) NOT NULL DEFAULT 'ROLE_USER', enabled BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`

## 2. User domain & repository (backend)

- [x] 2.1 `User` JPA entity mapping the `users` table; implement `UserDetails` interface (returns roles split from the `roles` column)
- [x] 2.2 `UserRepository` (Spring Data JPA): `findByUsername(String)`, `existsByUsername(String)`, `existsByEmail(String)`
- [x] 2.3 `UserService`: `loadUserByUsername` (implements `UserDetailsService`), `createUser(username, email, rawPassword, roles)` with BCrypt encoding, `seedAdmin()` called from `@PostConstruct`
- [x] 2.4 `BCryptPasswordEncoder` bean in a `PasswordConfig` class; use it in `UserService`

## 3. JWT utility (backend)

- [x] 3.1 `JwtProperties`: read `JWT_SECRET` (base64) and `JWT_EXPIRATION_MS` from `AppProperties`; validate secret length ≥ 32 bytes on startup
- [x] 3.2 `JwtUtil`: `generateToken(UserDetails)` → signed HS256 JWT with `sub=username`, `roles` claim, `iat`, `exp`; `validateToken(String)` → boolean; `extractUsername(String)` → String
- [x] 3.3 `JwtAuthFilter` (extends `OncePerRequestFilter`): extract token from `Authorization: Bearer` header or `?token=` query param; validate; set `UsernamePasswordAuthenticationToken` in `SecurityContextHolder`

## 4. Security configuration (backend)

- [x] 4.1 Update `SecurityConfig`: stateless session policy, disable CSRF, add `JwtAuthFilter` before `UsernamePasswordAuthenticationFilter`, permit `POST /api/auth/login` + health/docs paths, require auth for all other `/api/**`
- [x] 4.2 Expose `AuthenticationManager` bean via `authenticationManagerBean()` override in `SecurityConfig`

## 5. Auth endpoints (backend)

- [x] 5.1 `AuthController`: `POST /api/auth/login` — authenticate via `AuthenticationManager`, generate JWT, return `{ token, expiresAt, username, roles }`; return `401` on `BadCredentialsException` or disabled user
- [x] 5.2 `AuthController`: `GET /api/auth/me` — return `{ id, username, email, roles }` for the authenticated principal
- [x] 5.3 `AuthController`: `POST /api/auth/register` — `@PreAuthorize("hasRole('ADMIN')")`, create user, return `201` with `{ id, username }`; return `409` on duplicate username/email
- [x] 5.4 Enable `@EnableMethodSecurity` (or `@EnableGlobalMethodSecurity`) on `SecurityConfig` to support `@PreAuthorize`
- [x] 5.5 `RegisterRequest` DTO (username, email, password, roles list) + `LoginRequest` DTO + `AuthResponse` DTO

## 6. Tests (backend)

- [x] 6.1 `JwtUtilTests`: generate token, extract username, validate valid/expired/tampered tokens
- [x] 6.2 `UserServiceTests`: `createUser` encodes password (BCrypt), `seedAdmin` is idempotent, `loadUserByUsername` returns correct `UserDetails`
- [x] 6.3 `AuthControllerTests` (Spring MVC test slice): valid login returns 200 + token; wrong password returns 401; register as admin creates user; register as non-admin returns 403

## 7. Frontend — auth service & interceptor

- [x] 7.1 `auth.service.ts`: `login(username, password)` → calls `POST /api/auth/login`, stores token in `localStorage`, exposes `currentUser` signal and `isLoggedIn` computed; `logout()` clears storage
- [x] 7.2 `auth.interceptor.ts`: HTTP interceptor that reads token from `AuthService` and adds `Authorization: Bearer <token>` header to every outgoing request (skip `/api/auth/login`)
- [x] 7.3 Register `authInterceptor` in `main.ts` providers via `provideHttpClient(withInterceptors([authInterceptor]))`
- [x] 7.4 Update `JobsStore`: change EventSource URL to `/api/jobs/events?token=<jwt>` (read from `AuthService`)

## 8. Frontend — login UI

- [x] 8.1 `login.component.ts`: standalone component with username/password fields (PrimeNG `InputText` + `Password`), submit button, error message on 401; on success call `AuthService.login()` and navigate to `/`
- [x] 8.2 Add `provideRouter` with two routes to `main.ts`: `/login` → `LoginComponent`, `''` → `AppComponent` (auth guard redirects to `/login` if not logged in)
- [x] 8.3 `auth.guard.ts`: `CanActivateFn` that checks `AuthService.isLoggedIn()`; redirects to `/login` if false
- [x] 8.4 Add logout button to `app.component.ts` topbar that calls `AuthService.logout()` and navigates to `/login`
