## Context

El proyecto tiene un `ReindexService` que recorre todos los ficheros `.md` del vault y los vuelca de forma atómica en `DocumentIndexRepository`. Actualmente no existe ningún endpoint HTTP que lo exponga, ni mecanismo de progreso incremental. El backend ya usa `SseEmitter` para el streaming de eventos de jobs (`JobEventService`), lo que sirve de precedente para el patrón de streaming a usar.

## Goals / Non-Goals

**Goals:**
- Exponer un endpoint `POST /settings/reindex` que lance la reindexación y devuelva un stream SSE con el progreso.
- Mostrar en Settings la métrica "Ficheros procesados x/y" actualizada en tiempo real.
- Completar con un evento final `done` (éxito) o `error`.

**Non-Goals:**
- Reindexar rutas parciales del vault.
- Programar reindexaciones automáticas (cron).
- Mostrar el progreso en el visor de jobs (`/jobs`).
- Soporte para múltiples reindexaciones simultáneas.

## Decisions

### 1. SSE directo desde el endpoint en lugar de reutilizar `/jobs/events`

El endpoint `POST /settings/reindex` devuelve directamente un `SseEmitter` y emite eventos de progreso conforme procesa cada fichero. No se crea un `Job` en base de datos ni se encola en `JobQueueService`.

**Alternativa descartada**: integrar reindex como `JobType.REINDEX` en el sistema de colas. Añadiría complejidad (persistencia, cola, worker thread distinto) innecesaria para una operación de mantenimiento puntual que el usuario lanza conscientemente y cuya duración es acotada.

**Rationale**: el patrón SSE-desde-endpoint ya existe en `JobController.events()`, minimiza la superficie de cambio y mantiene la reindexación fuera del pipeline de ingesta.

### 2. Progreso por fichero procesado

`ReindexService.reindexWiki()` actualmente acumula todos los documentos y hace un `replaceDocuments` atómico al final. Se refactorizará para aceptar un `Consumer<ReindexProgress>` que se invoca tras procesar cada fichero, donde `ReindexProgress` contiene `processed` (contador) y `total` (total de ficheros `.md` detectados al inicio).

El `replaceDocuments` sigue siendo atómico al final para evitar estados intermedios en el índice.

### 3. Nuevo `SettingsController` (en lugar de ampliar `PromptController`)

El endpoint vive en `POST /settings/reindex` bajo un nuevo `SettingsController` para mantener la separación de responsabilidades. `PromptController` queda bajo `/settings/prompts`.

### 4. Frontend: `EventSource` nativo

El frontend usa la API `EventSource` nativa del navegador para consumir el stream SSE, expuesta como un `Observable` en `ApiService.reindex()`. Angular no tiene un wrapper oficial para SSE; usar `EventSource` directamente es la solución más simple y sin dependencias adicionales.

## Risks / Trade-offs

- **[Riesgo] Reindexación lenta bloquea el hilo HTTP**: `ReindexService` lee ficheros de disco de forma síncrona. En vaults muy grandes puede tardar varios segundos. → Mitigación: ejecutar en un `@Async` thread pool; el `SseEmitter` tiene timeout 0 (infinito) igual que el emitter de jobs.
- **[Riesgo] El usuario cierra la ventana a mitad del proceso**: el `SseEmitter` detectará el cierre del cliente (`onError`/`onCompletion`) y parará la ejecución. El índice quedará en el estado previo hasta que `replaceDocuments` se invoque (al final), así que no hay estado parcial.
- **[Trade-off] Sin persistencia del resultado**: si el usuario refresca la página durante la reindexación, pierde el progreso. Aceptable para una operación de mantenimiento que dura segundos/pocos minutos.

## Migration Plan

1. Desplegar el backend con el nuevo `SettingsController` y `ReindexService` modificado.
2. Desplegar el frontend con la nueva sección en Settings.
3. No hay migración de datos ni rollback especial: el endpoint es aditivo.

## Open Questions

_(ninguna)_
