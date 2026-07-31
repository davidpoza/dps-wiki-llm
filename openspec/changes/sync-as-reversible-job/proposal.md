## Why

La sincronización WebDAV manual se ejecuta hoy como un stream SSE ad-hoc (`GET /api/webdav/sync`) vinculado a la pestaña del navegador: si el usuario cierra la pestaña pierde toda visibilidad, no queda rastro en el historial de jobs, y —lo más importante— **no hay forma de deshacerla**. El sync escribe cambios remotos sobre el vault local (pulls y borrados) capturándolos en un snapshot `WEBDAV_PULL`, pero ese snapshot no se vincula a ningún `Job`, así que el mecanismo de revert existente no puede alcanzarlo. Un pull erróneo (por ejemplo, un remoto corrupto o una nota borrada por accidente en otro cliente) es irreversible desde la UI.

## What Changes

- **Nuevo `JobType.SYNC`** en el enum de tipos de job del backend.
- **Nuevo `SyncJobHandler`**: ejecuta `WebDavSyncService.sync(...)`, traduce el progreso (`SyncProgressDto`) a eventos de job vía `JobLifecycleService.progress()`, **vincula el snapshot de pull al job** (`finalizeSnapshot(snapshot, job)`) y registra en `affectedPaths` las rutas locales mutadas (pulls + borrados). El resumen (`pulled`/`pushed`/`deleted`/`conflicts`) se guarda en el `result` del job y en el mensaje de finalización.
- **`WebDavSyncService.sync()` deja de finalizar el snapshot con `null`**: acepta el `Job` (o devuelve snapshot + rutas locales afectadas) para que el snapshot quede asociado y sea revertible. La lógica de reconciliación (pull/push/delete/conflict) no cambia.
- **`JobConsumers`** añade el dispatch para `JobType.SYNC` en la cola de escritura.
- **Nuevo endpoint** `POST /api/jobs/sync` que encola el job de sync y devuelve `202 Accepted` con el job ID.
- **BREAKING** — **Eliminación del endpoint SSE** `GET /api/webdav/sync`. Los endpoints de conflictos (`GET/POST /api/webdav/conflicts`) se mantienen intactos.
- **Reversibilidad reutilizando el mecanismo existente**: el `SYNC` job se hace elegible para `POST /api/jobs/{id}/revert`. El revert restaura el vault local a su estado previo al sync (deshace pulls y borrados aplicados desde el remoto). Las subidas al remoto (pushes) no se deshacen directamente; el siguiente sync propaga la restauración local al remoto (comportamiento emergente documentado).
- **Frontend**: el botón de Sync (explorer y git-history) y el atajo `Ctrl+Shift+S` pasan a invocar `POST /api/jobs/sync`; el progreso se muestra en el panel de jobs estándar. Se añade `SYNC` a los tipos revertibles y al mapa de etiquetas de job. El revert solo se ofrece cuando el sync produjo cambios locales.

## Capabilities

### New Capabilities

_(ninguna nueva: la sincronización WebDAV ya existe; cambia su mecanismo de ejecución y se le añade reversibilidad)_

### Modified Capabilities

- `webdav-vault-sync`: El requisito de sync manual cambia de un endpoint sincrónico/SSE a un job persistido de tipo `SYNC` encolado en la cola de escritura y observable desde el panel de jobs; se añade el requisito de que el sync sea revertible mediante el mecanismo de revert de jobs existente, restaurando el vault local a su estado previo. Se elimina el modelo SSE por invocación (`GET /api/webdav/sync`).

## Impact

- **Backend**: `JobType.java` (nuevo valor `SYNC`), `JobConsumers.java` (dispatch), nuevo `SyncJobHandler.java`, nuevo `SyncJobController.java` (`POST /api/jobs/sync`), `WebDavSyncService.java` (vincular snapshot al job + exponer rutas locales afectadas), `WebDavController.java` (eliminar `GET /webdav/sync`).
- **Frontend**: `api.service.ts` (nuevo `enqueueSync()`, eliminación del SSE `syncWebdav()` / tipos `SyncEvent`/`SyncProgress`/`SyncDone`), `explorer.component.ts` y `git-history.component.ts` (usar el enqueue + reload de árbol al completar el job), `jobs-viewer.component.ts` (añadir `SYNC` a `REVERTIBLE_TYPES` y a `jobTypeLabel`, gatear el revert a syncs con cambios locales), claves i18n de transloco para la etiqueta `SYNC`.
- **Reversibilidad**: reutiliza `JobRevertService` sin modificarlo (usa `snapshotId` + `affectedPaths` del job). El revert de un sync solo restaura ficheros locales; los pushes al remoto no se deshacen en el mismo revert.
- **Sin cambios de esquema de BD**: `Job` ya soporta el nuevo tipo vía el enum; el snapshot `WEBDAV_PULL` ya existe.
- **Dependencias**: sin nuevas; reutiliza RabbitMQ, `JobLifecycleService`, `JobEventService`, `JobQueueService`, `SnapshotService` y `JobRevertService`.
