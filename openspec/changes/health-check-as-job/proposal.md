## Why

El health check (completo y parcial) actualmente se ejecuta como un stream SSE vinculado a la conexión del navegador: si el usuario cierra la pestaña o pierde conectividad, el proceso sigue en el servidor pero la visibilidad se pierde y no queda registro. Al igual que otros procesos largos del sistema (`REGENERATE_KEYWORDS`, `MERGE`, `RENAME`), el health check debe encolarse como un job persistido y ejecutarse por el worker de RabbitMQ, de modo que el progreso sea trazable desde cualquier sesión y el resultado quede en el historial de jobs.

## What Changes

- **Nuevo `JobType.HEALTH_CHECK`** en el enum de tipos de job del backend.
- **Nuevo `HealthCheckJobHandler`**: ejecuta las fases de embeddings y conexiones usando `JobLifecycleService` para emitir eventos de progreso, igual que `KeywordRegenerationJobHandler`.
- **`JobConsumers`** añade el dispatch para `HEALTH_CHECK`.
- **Nuevos endpoints POST** para encolar el health check:
  - `POST /api/jobs/health-check` → health check completo.
  - `POST /api/jobs/health-check/partial` con body `{ paths: string[] }` → health check parcial.
- **Eliminación de los endpoints SSE** `GET /api/settings/health-check` y `GET /api/settings/health-check/partial` (ya no son necesarios).
- **Frontend**: los componentes de Settings y el modal de selección parcial pasan a invocar el endpoint POST y muestran el progreso a través del stream de eventos de job existente, en lugar del SSE ad-hoc.

## Capabilities

### New Capabilities

_(ninguna nueva: el health check ya existe; solo cambia su mecanismo de ejecución)_

### Modified Capabilities

- `vault-health-check`: El requisito de progreso en tiempo real cambia de SSE propio a eventos de job; la UI pasa de bloquear el botón con SSE a encolar el job y mostrar progreso en el panel de jobs.
- `health-check-partial`: El endpoint `GET /api/settings/health-check/partial` es reemplazado por `POST /api/jobs/health-check/partial`; el modal de selección encola el job en lugar de abrir un SSE.

## Impact

- **Backend**: `JobType.java`, `JobConsumers.java`, nuevo `HealthCheckJobHandler.java`, nuevo `HealthCheckController.java` (o extensión de `JobController`), eliminación de los dos endpoints SSE de `SettingsController`.
- **Frontend**: `api.service.ts` (nuevos métodos `enqueueHealthCheck` / `enqueueHealthCheckPartial`, eliminación de `runHealthCheck` / `runHealthCheckPartial`), `settings.component.ts`, `health-check-selection-modal.component.ts`.
- **Sin cambios de esquema de BD**: `Job` ya soporta el job type nuevo con el enum.
- **Dependencias**: sin nuevas dependencias; reutiliza RabbitMQ, `JobLifecycleService`, `JobEventService` y `JobQueueService` existentes.
