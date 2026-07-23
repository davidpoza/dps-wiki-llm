## Why

Los operadores y desarrolladores necesitan saber qué versión exacta del frontend y del backend está desplegada para diagnosticar incidencias y verificar despliegues. Actualmente no hay ningún punto visible en la UI donde consultar esto.

## What Changes

- Habilitar el endpoint `/actuator/info` en el backend para exponer la versión del artefacto (usando el plugin `build-info` de Maven).
- Añadir un método en `ApiService` del frontend para llamar a `/actuator/info` y obtener la versión del backend.
- Añadir un footer en la pantalla de Settings que muestre la versión del frontend (inyectada en tiempo de build desde `package.json` vía `environment.ts`) y la versión del backend (obtenida del actuator en runtime).

## Capabilities

### New Capabilities

- `version-display`: Muestra las versiones de frontend y backend en un footer de la pantalla de Settings. El frontend obtiene su propia versión del entorno Angular y la del backend via `/actuator/info`.

### Modified Capabilities

_(ninguna)_

## Impact

- **Backend**: `pom.xml` (añadir plugin `spring-boot-maven-plugin` con goal `build-info`), `application.yml` (asegurar que `info` endpoint esté expuesto sin autenticación).
- **Frontend**: `src/environments/environment.ts` y `environment.prod.ts` (añadir `appVersion`), `src/app/services/api.service.ts` (método `getBackendInfo()`), `src/app/components/settings.component.ts` (footer con ambas versiones).
- **Sin breaking changes**. El endpoint `/actuator/info` ya está incluido en `management.endpoints.web.exposure.include`.
