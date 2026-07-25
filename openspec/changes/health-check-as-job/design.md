## Context

El sistema dispone de un worker de jobs basado en RabbitMQ con dos colas (`WRITE_QUEUE` y `ANSWER_QUEUE`). Los procesos largos que modifican el vault (ingesta, enriquecimiento, fusión de conceptos, regeneración de keywords, renombrado) siguen el patrón: un endpoint POST encola el job → `JobQueueService.enqueue()` persiste el registro en BD y lo publica en la cola → `JobConsumers` despacha al handler correspondiente → el handler usa `JobLifecycleService` para emitir eventos de progreso que el frontend consume vía SSE compartido (`/api/jobs/stream`).

El health check, en cambio, abre su propio SSE ad-hoc por petición, corre en un `CompletableFuture.runAsync()` sin pool dedicado y no deja rastro en el historial de jobs. El objetivo es unificarlo con el patrón existente.

## Goals / Non-Goals

**Goals:**
- Encolar el health check (completo y parcial) como un `Job` de tipo `HEALTH_CHECK` en `WRITE_QUEUE`.
- Emitir progreso a través de `JobEventService.broadcast()`, visible en el stream global de jobs.
- Eliminar los endpoints SSE dedicados de `SettingsController`.
- Actualizar el frontend para encolar el job y mostrar progreso vía el panel de jobs estándar.
- El health check parcial pasa el conjunto de paths como `payloadRef` (fichero JSON en `raw/health-check/<uuid>.json`), igual que `REGENERATE_KEYWORDS` hace con sus paths.

**Non-Goals:**
- Cambiar la lógica de negocio de las dos fases (embeddings + connections) — `HealthCheckService` no se toca.
- Añadir cancelación del health check en ejecución (el job entra en `STARTED`, no en `QUEUED` ejecutable).
- Soporte multi-tenant o concurrencia entre varios health checks simultáneos.

## Decisions

### D1: Reutilizar `HealthCheckService` sin modificarlo

`HealthCheckService.run(Set<String>, Consumer<HealthCheckProgress>)` ya acepta un callback de progreso. El nuevo `HealthCheckJobHandler` lo invocará pasando un consumer que traduce `HealthCheckProgress` a llamadas `JobLifecycleService.progress()`. No hay lógica de negocio duplicada.

_Alternativa descartada_: mover toda la lógica al handler — innecesario y rompe la separación de responsabilidades.

### D2: Evento de progreso como JSON plano en el campo `result`

`JobLifecycleService.progress(job, step, message, result)` emite un `JobEvent` con los campos `step`, `message` y `result`. El handler emitirá:
- `step = "embeddings"` / `"connections"` según la fase.
- `result = JSON` con `{"processed":X,"total":Y,"embeddingsBuilt":Z,"connectionsFound":W}`.

El frontend ya sabe parsear el campo `result` de los eventos de job; no se necesita un nuevo tipo de evento.

### D3: Payload del health check parcial en fichero (igual que REGENERATE_KEYWORDS)

Para el health check parcial, los paths se serializan como JSON a `raw/health-check/<uuid>.json` y se referencia como `payloadRef`. Esto evita sobrecargar el campo `payloadRef` con strings largos.

### D4: Eliminar endpoints SSE de SettingsController

Los endpoints `GET /api/settings/health-check` y `GET /api/settings/health-check/partial` se eliminan. El frontend sustituye las llamadas SSE por POST a los nuevos endpoints y consume el progreso mediante el stream de jobs global ya existente (`/api/jobs/stream`).

_Riesgo_: si hubiera clientes externos usando los SSE endpoints, dejarían de funcionar. En este proyecto no los hay.

### D5: Nuevo controller `HealthCheckJobController`

Se crea `HealthCheckJobController` con:
- `POST /api/jobs/health-check` → encola health check completo.
- `POST /api/jobs/health-check/partial` con body `{ "paths": [...] }` → encola parcial.

Ambos devuelven `EnqueueJobResponse` (`202 Accepted`).

## Risks / Trade-offs

- **[Riesgo] El health check es un proceso largo que puede tardar varios minutos** → al correr en el worker de RabbitMQ, el tiempo máximo de procesamiento está limitado por el timeout del consumer. El worker actual no tiene timeout configurado, lo que es coherente con los jobs de ingesta larga. Sin riesgo adicional.
- **[Riesgo] El resultado final (embeddings + connections) ya no aparece en el modal** → el frontend debe orientar al usuario hacia el panel de jobs para ver el resumen. Se puede mostrar el jobId al encolar para que el usuario localice el job.
- **[Trade-off] Pérdida del progreso porcentual en tiempo real dentro del modal del health check parcial** → el usuario verá el progreso en el panel de jobs global en lugar del modal. Esto es consistente con el resto de procesos largos del sistema.

## Migration Plan

1. Añadir `HEALTH_CHECK` a `JobType`.
2. Crear `HealthCheckJobHandler`.
3. Actualizar `JobConsumers` con el nuevo case.
4. Crear `HealthCheckJobController`.
5. Eliminar los dos endpoints SSE de `SettingsController`.
6. Actualizar `ApiService` en el frontend (añadir `enqueueHealthCheck` / `enqueueHealthCheckPartial`, eliminar `runHealthCheck` / `runHealthCheckPartial`).
7. Actualizar `settings.component.ts` y `health-check-selection-modal.component.ts`.

Sin migración de datos: los jobs anteriores no existían en BD (el health check no se persistía), así que no hay registros históricos que migrar.

## Open Questions

_(ninguna: el patrón es conocido y ya existe en el codebase)_
