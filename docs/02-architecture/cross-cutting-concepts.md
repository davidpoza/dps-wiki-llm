# Conceptos transversales

## Separacion `raw/` vs `wiki/`

El backend acepta fuentes de ingesta solo bajo `raw/**`. `SourceNormalizer.normalize` rechaza cualquier `payloadRef` que no empiece por `raw/`. `ReindexService` indexa exclusivamente markdown bajo `wiki/`.

Fuente: `SourceNormalizer.java`, `ReindexService.java`.

## Guardrails de mutacion

Las mutaciones propuestas por IA se convierten a `MutationPlan` y se validan antes de escribirse:

- el destino debe estar bajo `wiki/**`;
- una accion `create` no puede apuntar a `wiki/topics/**`;
- las acciones no-`noop` requieren `idempotency_key`;
- conceptos, entidades, temas y analisis requieren enlace a fuente;
- slugs de conceptos se normalizan hacia singular cuando es mecanicamente posible.

Fuente: `MutationGuardrailService.java`, `MutationApplier.java`.

## Idempotencia

`MutationApplier` mantiene `state/runtime/idempotency-keys.json`. Si una key ya existe para el mismo path, la accion se considera idempotente y no vuelve a escribir. Si la misma key apunta a otro path, se lanza error por colision.

Fuente: `MutationApplier.java`.

## Progreso en tiempo real

El backend publica eventos SSE desde `JobEventService` para los procesos encolados. Health Check usa este canal global porque se ejecuta como job `HEALTH_CHECK`. Otros endpoints SSE directos siguen existiendo para tareas manuales como reindex, keywords faltantes, enlaces rotos, WebDAV sync, deduplicacion y discovery de enlaces. El frontend usa `EventSource`; para SSE el token puede viajar en query string.

Fuente: `JobEventService.java`, `HealthCheckJobController.java`, `HealthCheckJobHandler.java`, `SettingsController.java`, `WebDavController.java`, `frontend/src/app/services/api.service.ts`, `JwtAuthFilter.java`.

## Observabilidad

Se usa SLF4J/Logback por la configuracion de Spring Boot. `LOG_LEVEL` ajusta el nivel root. Actuator expone `health` e `info`; `EmbeddingsHealthIndicator` comprueba `/health` del sidecar TEI.

Fuente: `application.yml`, `EmbeddingsHealthIndicator.java`, `docker-compose.yml`.

## Seguridad de rutas del vault

`VaultPathResolver` normaliza separadores, rechaza rutas absolutas y evita traversal verificando que el path resuelto siga bajo el vault root.

Fuente: `VaultPathResolver.java`, `VaultPathResolverTests.java`.
