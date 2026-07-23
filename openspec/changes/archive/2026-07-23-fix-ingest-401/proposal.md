## Why

Las peticiones a `/ingest` (y cualquier endpoint protegido) devuelven 401 tras un reinicio del backend porque `JWT_SECRET` está vacío por defecto y `JwtUtil` genera una clave efímera aleatoria en cada arranque, invalidando todos los tokens existentes. Además, el frontend no gestiona las respuestas 401 y deja al usuario con la UI rota en lugar de redirigirle al login.

## What Changes

- **Backend**: Añadir un secreto JWT estable por defecto en `application.yml` para entornos de desarrollo, eliminando el uso de clave efímera cuando `JWT_SECRET` no está configurado.
- **Frontend**: Ampliar `authInterceptor` para interceptar respuestas 401, limpiar el token almacenado y redirigir al usuario a `/login` automáticamente.

## Capabilities

### New Capabilities

- `jwt-stable-dev-secret`: Secreto JWT estable en dev para que el backend sobreviva reinicios sin invalidar tokens activos.
- `frontend-401-redirect`: El interceptor HTTP del frontend detecta 401 y fuerza logout + redirección a `/login`.

### Modified Capabilities

<!-- No hay cambios en requisitos de specs existentes -->

## Impact

- `backend/src/main/resources/application.yml` — valor por defecto de `app.jwt.secret`
- `frontend/src/app/services/auth.interceptor.ts` — añadir gestión de respuestas 401
