# ADR-0011: Ejecutar Health Check como job

- Estado: Aceptada por codigo actual
- Fecha: 2026-07-25
- Responsables: No determinado a partir del repositorio
- Ambito: Backend, frontend, jobs, mantenimiento del vault

## Contexto

Health Check reconcilia el vault: reindexa `wiki/**`, actualiza embeddings y descubre conexiones semanticas para materializarlas en secciones `Related`. Es una operacion de mantenimiento que puede mutar multiples notas y el ledger de idempotencia.

Antes del cambio actual, los endpoints `GET /api/settings/health-check` y `GET /api/settings/health-check/partial` ejecutaban el proceso directamente desde `SettingsController` y devolvian progreso por un SSE propio.

## Problema

La ejecucion directa desde Settings dejaba Health Check fuera del modelo normal de jobs. Eso separaba su progreso, cancelacion, historial y asociacion de snapshots del flujo usado por otras operaciones mutantes.

## Opciones consideradas

### Opcion 1

Mantener Health Check como SSE directo en `SettingsController`.

### Opcion 2

Crear endpoints de jobs para encolar Health Check completo y parcial en `wiki-write-jobs`.

### Opcion 3

Implementar Health Check como tarea programada independiente.

## Decision

Health Check se ejecuta como job `HEALTH_CHECK` en la cola `wiki-write-jobs`.

Los endpoints son:

- `POST /api/jobs/health-check`
- `POST /api/jobs/health-check/partial`

El caso parcial escribe la lista de paths en `raw/health-check/<uuid>.json` y pasa esa ruta como `payloadRef`. `HealthCheckJobHandler` lee el payload, ejecuta discovery, crea snapshot asociado al job, aplica conexiones y finaliza el job.

## Justificacion

- Health Check muta el vault y debe serializarse con el resto de operaciones de escritura.
- El progreso queda en el stream global de jobs.
- El snapshot queda vinculado al job y puede participar en historial/reversion.
- El frontend puede reutilizar el panel de jobs en lugar de mantener un SSE especializado.

## Consecuencias positivas

- Menos rutas SSE especificas para mantenimiento.
- Mejor coherencia con INGEST, RENAME, MERGE y REGENERATE_KEYWORDS.
- Health Check queda visible como job normal.
- Las mutaciones `Related` quedan asociadas a un snapshot del job.

## Consecuencias negativas

- El usuario ya no ve contadores detallados dentro del modal de Settings; debe seguirlos en el panel de jobs.
- El payload parcial crea archivos bajo `raw/health-check/**` cuya politica de limpieza no esta documentada en el codigo.

## Riesgos

- Si el panel de jobs no esta visible o no consume eventos, el usuario puede pensar que el Health Check solo fue encolado y no ejecutado.
- Los paths parciales se aceptan como payload y la validacion profunda queda delegada al flujo posterior.

## Criterios para revisar esta decision

- Si Health Check necesita cancelacion fina, programacion o prioridades separadas.
- Si se implementa una cola dedicada para mantenimiento pesado.
- Si `raw/health-check/**` requiere expiracion o limpieza automatica.

## Referencias al codigo

- `backend/src/main/java/com/dpswikillm/controllers/HealthCheckJobController.java`
- `backend/src/main/java/com/dpswikillm/services/HealthCheckJobHandler.java`
- `backend/src/main/java/com/dpswikillm/services/HealthCheckService.java`
- `backend/src/main/java/com/dpswikillm/domain/JobType.java`
- `backend/src/main/java/com/dpswikillm/services/JobConsumers.java`
- `frontend/src/app/components/settings.component.ts`
- `frontend/src/app/components/health-check-selection-modal.component.ts`
- `frontend/src/app/services/api.service.ts`
