## 1. Backend — Enum y dominio

- [x] 1.1 Añadir `SYNC` al enum `JobType` en `backend/src/main/java/com/dpswikillm/domain/JobType.java`

## 2. Backend — Vincular el snapshot de sync al job

- [x] 2.1 En `WebDavSyncService`, añadir una sobrecarga `sync(Consumer<SyncProgressDto> onProgress, Job job)` que reutilice la lógica actual pero finalice el snapshot de pull con `finalizeSnapshot(pullSnapshot, job)` cuando `job != null` (manteniendo la firma existente `sync(...)` para tests y el caso sin persistencia)
- [x] 2.2 Hacer que esa ruta devuelva, además del `SyncResultDto`, las rutas locales mutadas (`pulled ∪ deleted`) para que el handler pueda escribirlas en `job.affectedPaths` (p.ej. envolviendo `SyncResultDto` o exponiendo las listas ya disponibles); no incluir los `pushed` en las rutas afectadas
- [x] 2.3 Verificar que cuando no hay cambios locales el snapshot no se crea (`pullSnapshot == null`) y por tanto el job queda sin `snapshotId`

## 3. Backend — Handler del job

- [x] 3.1 Crear `backend/src/main/java/com/dpswikillm/services/SyncJobHandler.java` que reciba un `Job`, invoque `webDavSyncService.sync(onProgress, job)` traduciendo cada `SyncProgressDto(processed, total, path)` a `lifecycleService.progress(job, "sync-scan", path, "{\"current\":X,\"total\":Y}")`
- [x] 3.2 Al completar, fijar `job.affectedPaths` (JSON de `pulled ∪ deleted`) y `job.result` (JSON del `SyncResultDto`), y hacer `lifecycleService.transition(jobId, COMPLETED, "completed", <resumen pulled/pushed/deleted/conflicts>)`
- [x] 3.3 Manejar `WebDavNotConfiguredException` transicionando el job a `FAILED` con un mensaje claro "WebDAV not configured" (el `catch` genérico de `JobConsumers` cubre el resto de errores)

## 4. Backend — Consumer

- [x] 4.1 Inyectar `SyncJobHandler` en el constructor de `JobConsumers`
- [x] 4.2 Añadir el dispatch para `JobType.SYNC` en `JobConsumers.consumeWriteJob()` invocando `syncJobHandler.run(job)`

## 5. Backend — Controller y eliminación del SSE

- [x] 5.1 Crear `backend/src/main/java/com/dpswikillm/controllers/SyncJobController.java` con `POST /api/jobs/sync` que llame a `queueService.enqueue(JobType.SYNC, JobMode.unattended, null)` y devuelva `202 Accepted` con `EnqueueJobResponse`
- [x] 5.2 Eliminar el método `sync()` (`GET /webdav/sync`) de `WebDavController`, dejando intactos los endpoints de conflictos

## 6. Frontend — API Service

- [x] 6.1 Añadir `enqueueSync(): Observable<EnqueueResponse>` en `api.service.ts` que haga `POST /api/jobs/sync`
- [x] 6.2 Eliminar `syncWebdav()` y los tipos SSE asociados (`SyncEvent`, `SyncProgress`, `SyncDone`) de `api.service.ts`; conservar el tipo `SyncResult` para leer el `result` del job si se muestra el resumen

## 7. Frontend — Migrar callers del sync

- [x] 7.1 Actualizar `explorer.component.ts`: `sync()` llama a `api.enqueueSync()`; mostrar feedback breve de "sync encolado" y recargar el árbol (`reloadTree()`) cuando el job `SYNC` alcance `COMPLETED` con cambios (suscribiéndose al `JobsStore`) en lugar del callback `done` del SSE
- [x] 7.2 Actualizar el atajo `Ctrl+Shift+S` para que dispare `enqueueSync()` (mantener la guarda contra doble disparo) y el botón muestre estado mientras la petición POST está en vuelo
- [x] 7.3 Actualizar `git-history.component.ts` para usar `api.enqueueSync()` en lugar de `syncWebdav()`

## 8. Frontend — Jobs viewer (revert + etiqueta)

- [x] 8.1 Añadir `'SYNC'` a `REVERTIBLE_TYPES` en `jobs-viewer.component.ts`
- [x] 8.2 Gatear `canRevert` para `SYNC`: además de `status === 'COMPLETED'`, exigir que el sync haya producido cambios locales (derivado de `job.result`: `pulled.length + deleted.length > 0`)
- [x] 8.3 Añadir la etiqueta `SYNC: 'Sync'` (o clave transloco equivalente) a `jobTypeLabel`
- [x] 8.4 Añadir la clave i18n para el tipo `SYNC` en los ficheros de traducción de transloco

## 9. Verificación

- [x] 9.1 Compilar el backend (`mvn compile`) sin errores
- [x] 9.2 Compilar/lint del frontend (`ng build` o el script del proyecto) sin errores
- [ ] 9.3 Arrancar el sistema con WebDAV configurado, pulsar Sync y verificar que aparece un job `SYNC` en el panel de jobs con progreso y resumen final (verificación manual)
- [ ] 9.4 Provocar un pull (cambiar una nota en el remoto), sincronizar, y luego revertir el job `SYNC`; verificar que la nota local vuelve a su estado previo y el job queda `REVERTED` (verificación manual)
- [ ] 9.5 Verificar que un sync sin cambios locales no ofrece el botón de revert (verificación manual)
- [ ] 9.6 Verificar que `GET /api/webdav/sync` ya no existe (404) y que `GET/POST /api/webdav/conflicts` siguen funcionando (verificación manual)
