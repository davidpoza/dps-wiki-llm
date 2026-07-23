# frontend-401-redirect Specification

## Purpose
TBD - created by archiving change fix-ingest-401. Update Purpose after archive.
## Requirements
### Requirement: Redirección automática al login en respuesta 401
El sistema SHALL detectar respuestas HTTP 401 de la API, limpiar el estado de autenticación local y redirigir al usuario a `/login` de forma automática.

#### Scenario: 401 en endpoint protegido
- **WHEN** el frontend recibe una respuesta 401 de cualquier endpoint de la API (excepto `/api/auth/login`)
- **THEN** el sistema elimina el token de `localStorage`, limpia la señal de usuario autenticado y navega a `/login`

#### Scenario: No se produce loop en el endpoint de login
- **WHEN** la petición de login devuelve 401 (credenciales incorrectas)
- **THEN** el sistema NO redirige a `/login` ni limpia el estado de autenticación; el error se propaga al componente normalmente

