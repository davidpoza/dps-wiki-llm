## Why

Los jobs en estado QUEUED no pueden cancelarse actualmente, lo que obliga al usuario a esperar a que finalicen aunque ya no sean necesarios. Esta funcionalidad es esencial para corregir errores de ingesta o evitar procesar contenido obsoleto.

## What Changes

- Se añade el estado `CANCELLED` al enum `JobStatus`.
- Se expone el endpoint `DELETE /jobs/{id}` en el backend, restringido a jobs en estado QUEUED.
- El consumer de RabbitMQ ignora jobs en estado CANCELLED cuando los recibe.
- El frontend muestra un botón de cancelar en los jobs con estado QUEUED.
- El store y el API service del frontend incluyen el nuevo método de cancelación.

## Capabilities

### New Capabilities

- `cancel-queued-job`: Permite cancelar un job en estado QUEUED desde la API REST y desde la UI. Cubre el endpoint backend, la lógica de transición de estado, el guard en el consumer y el botón en el visor de jobs.

### Modified Capabilities

## Impact

- `backend/src/main/java/com/dpswikillm/domain/JobStatus.java` — nuevo valor CANCELLED
- `backend/src/main/java/com/dpswikillm/controllers/JobController.java` — nuevo endpoint DELETE /jobs/{id}
- `backend/src/main/java/com/dpswikillm/services/JobConsumers.java` — guard para jobs CANCELLED
- `frontend/src/app/services/api.service.ts` — método `cancelJob`
- `frontend/src/app/components/jobs-viewer.component.ts` — botón cancelar para jobs QUEUED
- `frontend/src/app/types.ts` — añadir CANCELLED a JobStatus
