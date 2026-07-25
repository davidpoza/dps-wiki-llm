## 1. Backend — Servicio

- [x] 1.1 Añadir método `abandonJob(UUID jobId)` en `JobLifecycleService`: verificar que el estado sea `PROGRESS` o `STARTED`, lanzar `ResponseStatusException(CONFLICT)` si no lo es, y llamar a `transition(jobId, FAILED, "abandoned", "Abandoned by user")`

## 2. Backend — Controlador

- [x] 2.1 Añadir endpoint `POST /jobs/{id}/abandon` en `JobController` que delega en `lifecycleService.abandonJob(id)` y retorna HTTP 200

## 3. Frontend — ApiService

- [x] 3.1 Añadir método `abandonJob(jobId: string): Observable<void>` en `ApiService` que hace `POST /jobs/{jobId}/abandon`

## 4. Frontend — UI

- [x] 4.1 Añadir método `canAbandon(job)` en `jobs-viewer.component.ts` que retorna `true` si el estado es `PROGRESS` o `STARTED`
- [x] 4.2 Añadir método `abandon(jobId)` en `jobs-viewer.component.ts` que llama a `api.abandonJob(jobId)` con manejo de error
- [x] 4.3 Añadir botón "Abandonar" en la template de la job card, visible sólo cuando `canAbandon(job)` es verdadero

## 5. Verificación

- [x] 5.1 Verificar manualmente que el botón Abandonar aparece en jobs con estado `PROGRESS` y no aparece en jobs con otros estados
- [x] 5.2 Verificar que al pulsar el botón el job pasa a estado `FAILED` con error `"Abandoned by user"` y la UI se actualiza
