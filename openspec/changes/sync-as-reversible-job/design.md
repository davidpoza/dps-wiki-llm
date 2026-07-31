## Context

El worker de jobs (RabbitMQ, `WRITE_QUEUE` + `ANSWER_QUEUE`) es el patrón estándar para todo proceso largo que muta el vault: un endpoint POST encola → `JobQueueService.enqueue()` persiste el `Job` y publica el mensaje → `JobConsumers.consumeWriteJob()` despacha al handler → el handler usa `JobLifecycleService` para emitir progreso por el stream SSE global de jobs. Los jobs que capturan sus cambios en un `Snapshot` vinculado (`finalizeSnapshot(snapshot, job)` fija `job.snapshotId`) son revertibles mediante `POST /api/jobs/{id}/revert` → `JobRevertService.revert()`, que hace `hardReset` del snapshot del target, reindexa y marca el job `REVERTED`.

La sincronización WebDAV, en cambio, abre su propio SSE ad-hoc (`GET /api/webdav/sync`), corre en un `CompletableFuture.runAsync()` sin pool dedicado y **no deja rastro en el historial de jobs**. Internamente `WebDavSyncService.sync()` sí crea un snapshot `WEBDAV_PULL` que captura las mutaciones locales (pulls y borrados aplicados desde el remoto), pero lo finaliza con `finalizeSnapshot(pullSnapshot, null)` — sin job asociado — de modo que el `snapshotId` nunca llega a ningún `Job` y el revert existente no puede alcanzarlo.

El objetivo es unificar el sync con el patrón de jobs (precedente directo: `health-check-as-job`) y, aprovechando que la única pieza que falta es asociar el snapshot a un job, habilitar la reversibilidad reutilizando `JobRevertService` sin modificarlo.

## Goals / Non-Goals

**Goals:**
- Encolar el sync manual como un `Job` de tipo `SYNC` en `WRITE_QUEUE`, observable desde el panel de jobs y persistido en el historial.
- Emitir progreso vía `JobLifecycleService.progress()` a partir de `SyncProgressDto`.
- Vincular el snapshot de pull al job (`finalizeSnapshot(snapshot, job)`) y registrar en `job.affectedPaths` las rutas locales mutadas (pulls + borrados) para que el sync sea revertible con el mecanismo existente.
- Guardar el resumen `SyncResultDto` (`pulled`/`pushed`/`deleted`/`conflicts`) en el `result` del job y en el mensaje de finalización.
- Eliminar el endpoint SSE `GET /api/webdav/sync` y actualizar el frontend para encolar el job y observar el progreso en el panel de jobs.

**Non-Goals:**
- Modificar la lógica de reconciliación (pull/push/delete/conflict) de `WebDavSyncService.sync()` — el algoritmo no cambia.
- Modificar `JobRevertService` — el revert de un `SYNC` reutiliza exactamente el flujo genérico (snapshot `hardReset` + reindex).
- Deshacer los **pushes** al remoto dentro del mismo revert. El revert restaura el estado local previo; la propagación al remoto ocurre en el siguiente sync (ver D3).
- Tocar los endpoints de conflictos (`/api/webdav/conflicts`), el push síncrono por-guardado (`pushSaved`/`pushDeleted`/`pushMoved`) ni la inicialización de baselines.
- Cancelación de un sync en ejecución (el job pasa a `STARTED`, no queda cancelable en `QUEUED`).

## Decisions

### D1: `WebDavSyncService.sync()` recibe el `Job` y finaliza el snapshot contra él

Se añade una sobrecarga `sync(Consumer<SyncProgressDto> onProgress, Job job)` (la firma actual sin job se mantiene para tests y para el caso "sin persistencia"). El único cambio interno es:
- `finalizeSnapshot(pullSnapshot, job)` en lugar de `finalizeSnapshot(pullSnapshot, null)` cuando hay job.
- Devolver, además del `SyncResultDto`, las rutas locales mutadas para que el handler las escriba en `job.affectedPaths`. Estas rutas son exactamente `pulled ∪ deleted` (los pushes mutan el remoto, no el local, y no deben incluirse en `affectedPaths`).

El handler (no el service) es quien fija `job.affectedPaths` y `job.result`, para mantener a `WebDavSyncService` agnóstico del ciclo de vida del job salvo por la vinculación del snapshot.

_Alternativa descartada_: mover toda la reconciliación al handler — duplicaría lógica compleja y frágil. _Alternativa descartada_: que el service fije los campos del job — acopla el service al dominio de jobs más de lo necesario.

### D2: Progreso como evento `sync-scan` con JSON en `result`

El handler traduce cada `SyncProgressDto(processed, total, path)` a `lifecycleService.progress(job, "sync-scan", path, "{\"current\":X,\"total\":Y}")`. El `jobs.store.ts` del frontend ya parsea eventos cuyo `step` termina en `-scan` (rama `event.step?.endsWith('-scan')`) y calcula el porcentaje a partir de `{current,total}`, así que el progreso se muestra sin código nuevo de parseo. Al completar, `transition(job, COMPLETED, "completed", <resumen>)` con `pulled/pushed/deleted/conflicts`.

### D3: Modelo de reversibilidad — el revert restaura el local; el siguiente sync lo propaga al remoto

El snapshot `WEBDAV_PULL` captura **solo mutaciones locales**: los pulls (escritura remoto→local) y los borrados locales aplicados desde el remoto. `JobRevertService.revert()` hace `hardReset` de esos ficheros, dejando el vault local **exactamente como estaba antes del sync**, y reindexa. Esto cubre el caso de uso principal: "el último sync trajo basura / borró algo, deshazlo".

Consecuencia deliberada sobre los **pushes** y las **baselines**: el revert no reescribe el remoto ni las filas `VaultFileSync`. Pero el comportamiento emergente es coherente: tras el revert, para una ruta pulleada la baseline sigue apuntando al hash remoto nuevo mientras el contenido local vuelve al previo → en el **siguiente sync** se detecta `localChanged && !remoteChanged` y se **hace push del contenido restaurado al remoto**, propagando el undo. Para un borrado revertido (fichero restaurado localmente, baseline eliminada) el siguiente sync ve `localChanged && !remoteChanged` y **recrea el fichero en el remoto**. Es decir: revertir un sync deshace el efecto local inmediatamente y el efecto remoto en la siguiente sincronización.

_Alternativa descartada_: añadir a `JobRevertService` lógica específica de WebDAV (resetear baselines / re-pushear en el mismo revert). Rompería la genericidad del revert y mezclaría responsabilidades de WebDAV en el servicio de revert compartido; la propagación diferida ya da un resultado correcto.

### D4: El revert solo se ofrece cuando el sync produjo cambios locales

Un sync que solo empuja (push) o que no cambia nada no crea snapshot (`pullSnapshot == null`), así que `job.snapshotId` queda `null` y `JobRevertService.validateTarget` lanzaría "Target job has no snapshot". Para evitar un botón que falla, el frontend gatea la visibilidad del revert de un `SYNC` a que el resumen del job indique cambios locales (`pulled.length + deleted.length > 0`), derivado de `job.result`. Si por cualquier motivo se intenta revertir un sync sin cambios locales, el backend responde con el error existente y el frontend lo muestra.

### D5: Nuevo `SyncJobController` con `POST /api/jobs/sync`

Se crea `SyncJobController` con `POST /api/jobs/sync` → `queueService.enqueue(JobType.SYNC, JobMode.unattended, null)` → `202 Accepted` con el job ID. Se elimina `GET /api/webdav/sync` de `WebDavController` (los endpoints de conflictos permanecen). Cuando WebDAV no está configurado, el handler falla el job con un mensaje claro (`WebDavNotConfiguredException`), consistente con el resto de fallos de job.

### D6: Serialización en la cola de escritura

`WRITE_QUEUE` procesa los jobs de escritura de forma secuencial, por lo que dos `SYNC` encolados no corren en paralelo (el segundo será prácticamente un no-op si nada cambió). No se añade de-duplicación explícita de syncs en cola; es coherente con el resto de tipos de job.

## Risks / Trade-offs

- **[Riesgo] El usuario espera que "revertir un sync" también deshaga los pushes al remoto de inmediato** → Mitigación: documentar el modelo (D3) en el mensaje/resumen del job y en la UI; el efecto remoto se propaga en el siguiente sync. El caso de uso dominante (deshacer un pull dañino) queda cubierto al 100%.
- **[Riesgo] Conflictos de revert**: si un job posterior tocó una ruta que el sync había pulleado, `JobRevertService` reporta conflicto y no sobreescribe → Mitigación: es el comportamiento correcto y ya existente; se hereda sin cambios.
- **[Riesgo] Pérdida del progreso porcentual en el propio botón de sync** → el usuario ve el progreso en el panel de jobs global, no en un spinner local. Consistente con `health-check-as-job` y el resto de procesos largos.
- **[Trade-off/BREAKING] Eliminar `GET /api/webdav/sync`** rompería clientes externos que lo usaran; en este proyecto solo lo consumen `explorer.component.ts` y `git-history.component.ts`, que se migran en el mismo cambio.
- **[Riesgo] Un sync sin cambios crea un job "vacío" en el historial** → aceptable; deja traza de "se sincronizó y no había nada". El revert queda deshabilitado (D4).

## Migration Plan

1. Añadir `SYNC` a `JobType`.
2. Ajustar `WebDavSyncService.sync()` para aceptar el `Job`, finalizar el snapshot contra él y devolver las rutas locales afectadas.
3. Crear `SyncJobHandler` (progreso + `result` + `affectedPaths`).
4. Dispatch de `SYNC` en `JobConsumers` + inyección del handler.
5. Crear `SyncJobController` (`POST /api/jobs/sync`).
6. Eliminar `GET /api/webdav/sync` de `WebDavController`.
7. Frontend: `enqueueSync()` en `ApiService`, eliminar `syncWebdav()` SSE, migrar callers (`explorer`, `git-history`, atajo `Ctrl+Shift+S`), añadir `SYNC` a `REVERTIBLE_TYPES`/`jobTypeLabel` y gatear el revert (D4), clave i18n `SYNC`.

Sin migración de datos: los syncs anteriores no se persistían como jobs, no hay históricos que migrar. El snapshot `WEBDAV_PULL` y el esquema de `Job` ya existen.

## Open Questions

_(ninguna: el patrón es conocido —`health-check-as-job`— y el revert reutiliza infraestructura existente sin cambios)_
