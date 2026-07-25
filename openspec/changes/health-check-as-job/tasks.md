## 1. Backend — Enum y dominio

- [x] 1.1 Añadir `HEALTH_CHECK` al enum `JobType` en `backend/src/main/java/com/dpswikillm/domain/JobType.java`

## 2. Backend — Handler del job

- [x] 2.1 Crear `backend/src/main/java/com/dpswikillm/services/HealthCheckJobHandler.java` que recibe un `Job`, lee los paths del `payloadRef` (o usa `Set.of()` si es null para el health check completo), invoca `HealthCheckService.run(pathFilter, onProgress)` y emite eventos de progreso con `JobLifecycleService.progress()` (step = "embeddings" / "connections", result = JSON con `processed`, `total`, `embeddingsBuilt`, `connectionsFound`)
- [x] 2.2 Al completarse, llamar a `JobLifecycleService.transition(jobId, COMPLETED, "completed", <summary message>)` con los totales finales

## 3. Backend — Consumer

- [x] 3.1 Añadir el dispatch para `JobType.HEALTH_CHECK` en `JobConsumers.consumeWriteJob()` invocando `healthCheckJobHandler.run(job)`
- [x] 3.2 Inyectar `HealthCheckJobHandler` en el constructor de `JobConsumers`

## 4. Backend — Controller

- [x] 4.1 Crear `backend/src/main/java/com/dpswikillm/controllers/HealthCheckJobController.java` con:
  - `POST /api/jobs/health-check` → encola health check completo (sin payload file, `payloadRef = null`)
  - `POST /api/jobs/health-check/partial` con body `{ "paths": [...] }` (validado con `@NotEmpty`) → serializa paths a `raw/health-check/<uuid>.json` y encola el job

## 5. Backend — Eliminar endpoints SSE

- [x] 5.1 Eliminar el método `healthCheck()` (`GET /settings/health-check`) de `SettingsController`
- [x] 5.2 Eliminar el método `healthCheckPartial()` (`GET /settings/health-check/partial`) de `SettingsController`
- [x] 5.3 Eliminar las dependencias de `HealthCheckService` de `SettingsController` si ya no se usa en ningún otro método

## 6. Frontend — API Service

- [x] 6.1 Añadir `enqueueHealthCheck(): Observable<EnqueueResponse>` en `api.service.ts` que hace `POST /api/jobs/health-check`
- [x] 6.2 Añadir `enqueueHealthCheckPartial(paths: string[]): Observable<EnqueueResponse>` que hace `POST /api/jobs/health-check/partial`
- [x] 6.3 Eliminar `runHealthCheck()` y `runHealthCheckPartial()` de `api.service.ts`

## 7. Frontend — Settings component

- [x] 7.1 Actualizar `settings.component.ts`: el botón "Lanzar Health Check" llama a `api.enqueueHealthCheck()` en lugar de suscribirse al SSE; gestiona el estado `healthChecking` (true mientras la petición POST está en vuelo, false al recibir respuesta)
- [x] 7.2 Mostrar feedback visual al usuario tras encolar (p.ej. un toast o mensaje breve indicando que el job ha sido encolado)

## 8. Frontend — Modal de selección parcial

- [x] 8.1 Actualizar `health-check-selection-modal.component.ts`: el método `submit()` llama a `api.enqueueHealthCheckPartial(selected)` en lugar de `api.runHealthCheckPartial(selected)`
- [x] 8.2 Actualizar el tipo `Phase` eliminando `'running'` y `'done'` basados en SSE, añadiendo `'enqueued'` como estado post-encolamiento
- [x] 8.3 Simplificar la template del modal: eliminar las secciones de progreso SSE (`running-phase`, `done-phase`) y añadir un estado `enqueued` que muestra "Job encolado. Sigue el progreso en el panel de jobs." con opción de cerrar
- [x] 8.4 Eliminar las signals de progreso SSE (`hcPhase`, `hcProcessed`, `hcTotal`, `hcEmbeddings`, `hcConnections`, `hcPercent`) si ya no se usan

## 9. Verificación

- [x] 9.1 Compilar el backend (`mvn compile`) y verificar que no hay errores
- [ ] 9.2 Arrancar el backend y lanzar un health check completo desde Settings, verificar que el job aparece en el panel de jobs con progreso (verificación manual)
- [ ] 9.3 Abrir el modal de selección parcial, seleccionar notas y confirmar; verificar que el job aparece en el panel de jobs (verificación manual)
- [ ] 9.4 Verificar que los endpoints `GET /api/settings/health-check` y `GET /api/settings/health-check/partial` ya no existen (devuelven 404) (verificación manual)
