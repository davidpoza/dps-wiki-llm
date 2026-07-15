## Why

Los usuarios no tienen visibilidad sobre la actividad de acceso a su cuenta, lo que impide detectar accesos no autorizados o intentos de intrusión. Añadir un historial de logins (exitosos y fallidos) en la pantalla de perfil mejora la seguridad y la confianza del usuario.

## What Changes

- Nueva tabla `login_event` en PostgreSQL que registra cada intento de login con usuario, IP, geolocalización y resultado (éxito/fallo).
- El backend registra un evento en cada intento de login (incluyendo 2FA) en `AuthController`.
- Nuevo endpoint REST `GET /auth/login-history` que devuelve los últimos N eventos del usuario autenticado.
- Geolocalización obtenida en el backend a partir de la IP usando una librería embebida (sin dependencias externas de red).
- Nueva sección "Historial de accesos" en `profile.component.ts` con una tabla PrimeNG que muestra: fecha/hora, IP, geolocalización, resultado (éxito/fallo).

## Capabilities

### New Capabilities

- `login-event-tracking`: Persistencia de intentos de login (éxito y fallo) con IP, geolocalización y timestamp en una tabla dedicada.
- `login-history-api`: Endpoint REST para consultar el historial de accesos del usuario autenticado.
- `profile-login-history-ui`: Sección en la pantalla de perfil que muestra el historial de accesos en una tabla paginada.

### Modified Capabilities

<!-- No hay specs existentes afectadas a nivel de requisitos -->

## Impact

- **Backend**: nuevo entity `LoginEvent`, nuevo repository, nuevo Flyway migration (`V11__login_events.sql`), lógica en `AuthController` para registrar eventos, nuevo endpoint en `AuthController`.
- **Frontend**: `profile.component.ts` añade nueva sección con `TableModule` de PrimeNG; `auth.service.ts` añade método para fetch del historial.
- **Base de datos**: nueva tabla `login_events`.
- **Dependencias**: librería de geolocalización por IP (GeoLite2 / `maxmind-db-reader` o alternativa embebida).
