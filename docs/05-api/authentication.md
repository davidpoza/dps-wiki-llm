# Autenticacion y autorizacion

## Modelo

- Autenticacion stateless con JWT.
- Passwords con `PasswordEncoder` de Spring.
- 2FA TOTP opcional por usuario.
- Registro de usuarios protegido con `@PreAuthorize("hasRole('ADMIN')")`.
- CSRF deshabilitado por usar API stateless.

## Endpoints publicos

| Endpoint | Motivo |
|---|---|
| `POST /api/auth/login` | Inicio de sesion. |
| `POST /api/auth/login/2fa` | Completar desafio TOTP. |
| `/api/actuator/health/**`, `/api/actuator/info` | Health/readiness. |
| `/api/v3/api-docs/**`, `/api/swagger-ui/**`, `/api/swagger-ui.html` | OpenAPI UI. |

Todo lo demas requiere JWT valido.

## Flujo 2FA

1. `POST /auth/login` valida usuario/password.
2. Si TOTP esta activo, devuelve `challengeToken` con `scope=2fa`.
3. `POST /auth/login/2fa` valida el token de desafio y el codigo TOTP.
4. El JWT final tiene `scope=access`.
5. `JwtAuthFilter` rechaza tokens `scope=2fa` para acceso general.

Fuente: `SecurityConfig.java`, `JwtAuthFilter.java`, `JwtUtil.java`, `AuthController.java`, `TotpService.java`.

