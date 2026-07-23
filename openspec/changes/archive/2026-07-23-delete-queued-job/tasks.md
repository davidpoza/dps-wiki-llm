## 1. Backend — Dominio y estado

- [x] 1.1 Añadir `CANCELLED` al enum `JobStatus` en `backend/src/main/java/com/dpswikillm/domain/JobStatus.java`

## 2. Backend — Endpoint de cancelación

- [x] 2.1 Añadir método `cancelJob(UUID id)` en `JobLifecycleService` que valide que el job esté en QUEUED y lo transicione a CANCELLED emitiendo un SSE
- [x] 2.2 Añadir endpoint `DELETE /jobs/{id}` en `JobController` que delegue en `JobLifecycleService.cancelJob`, retorne 204 en éxito, 409 si el job no está en QUEUED y 404 si no existe

## 3. Backend — Guard en el consumer

- [x] 3.1 Añadir guard al inicio de `consumeWriteJob` en `JobConsumers`: si el job tiene estado CANCELLED, retornar sin ejecutar
- [x] 3.2 Añadir el mismo guard al inicio de `consumeAnswerJob` en `JobConsumers`

## 4. Frontend — Tipos y servicio API

- [x] 4.1 Añadir `'CANCELLED'` a la unión `JobStatus` en `frontend/src/app/types.ts`
- [x] 4.2 Añadir método `cancelJob(jobId: string): Observable<void>` en `ApiService` que llame a `DELETE /api/jobs/{id}`

## 5. Frontend — UI del visor de jobs

- [x] 5.1 Añadir método `canCancel(job: JobState): boolean` en `JobsViewerComponent` que retorne `true` solo si `job.status === 'QUEUED'`
- [x] 5.2 Añadir método `cancel(jobId: string): void` en `JobsViewerComponent` que llame a `api.cancelJob(jobId)`
- [x] 5.3 Añadir botón "Cancelar" en el template de `JobsViewerComponent` condicionado a `canCancel(job)`, con `severity="warn"` y `size="small"`
- [x] 5.4 Añadir caso `'CANCELLED': return 'secondary'` en el switch de `severity()` en `JobsViewerComponent`
