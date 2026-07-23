## 1. Base de datos — Tablas y migraciones Flyway

- [x] 1.1 Crear migración Flyway para tabla `snapshots` (id UUID, job_id, operation_type, message, created_at)
- [x] 1.2 Crear migración Flyway para tabla `snapshot_files` (id UUID, snapshot_id FK, path, content_before TEXT, content_after TEXT)
- [x] 1.3 Crear migración Flyway para añadir columna nullable `snapshot_id UUID` a tabla `jobs`

## 2. Dominio y repositorios

- [x] 2.1 Crear entidad JPA `Snapshot` mapeada a tabla `snapshots`
- [x] 2.2 Crear entidad JPA `SnapshotFile` mapeada a tabla `snapshot_files`
- [x] 2.3 Crear `SnapshotRepository` (JpaRepository) con query para listar por fecha desc con limit
- [x] 2.4 Crear `SnapshotFileRepository` con query por snapshotId y por path+snapshotId
- [x] 2.5 Actualizar entidad `Job` para añadir campo `snapshotId` (nullable UUID)

## 3. SnapshotService — lógica principal

- [x] 3.1 Crear `SnapshotService` con método `beginSnapshot(jobId, operationType, message) → Snapshot`
- [x] 3.2 Implementar `captureFile(snapshot, relPath)` — lee contenido actual del disco y guarda `content_before`
- [x] 3.3 Implementar `recordAfter(snapshot, relPath)` — lee contenido post-escritura y guarda `content_after`
- [x] 3.4 Implementar `finalizeSnapshot(snapshot)` — marca snapshot como completo y guarda `snapshot_id` en el Job
- [x] 3.5 Implementar `deleteSnapshot(snapshotId)` — borrar snapshot incompleto en caso de fallo del job
- [x] 3.6 Implementar `getHistory(int limit) → List<SnapshotDto>` con stats de líneas añadidas/borradas por fichero
- [x] 3.7 Implementar `getDiff(snapshotId, path) → String` usando `java-diff-utils` para generar unified diff en memoria
- [x] 3.8 Implementar `hardReset(snapshotId)` — restaura `content_before` de cada fichero al disco (elimina si null)
- [x] 3.9 Implementar `getPathsForSnapshot(snapshotId) → List<String>` para detección de conflictos

## 4. Añadir dependencia java-diff-utils

- [x] 4.1 Añadir `io.github.java-diff-utils:java-diff-utils` al `build.gradle` (o `pom.xml`) del backend

## 5. SnapshotController — endpoints REST

- [x] 5.1 Crear `SnapshotController` con `GET /api/snapshots?limit=N` → `List<SnapshotDto>`
- [x] 5.2 Implementar `GET /api/snapshots/{id}/diff?path=Y` → `text/plain` con unified diff
- [x] 5.3 Implementar `POST /api/snapshots/{id}/reset` → `{"snapshotId": "..."}` con hard reset
- [x] 5.4 Añadir DTOs: `SnapshotDto`, `SnapshotFileStatDto`

## 6. Integración con jobs de escritura

- [x] 6.1 Refactorizar el job de ingest para llamar `captureFile` antes de escribir y `recordAfter` tras escribir
- [x] 6.2 Llamar `finalizeSnapshot` al completar el job con éxito; llamar `deleteSnapshot` en compensación de `PipelineTx`
- [x] 6.3 Revisar si otros jobs de escritura (enrich-links, etc.) necesitan la misma integración

## 7. Refactorizar JobRevertService

- [x] 7.1 Reemplazar la llamada a `gitService.revertRangeNoCommit()` por `snapshotService.hardReset(snapshotId)`
- [x] 7.2 Reemplazar la obtención de paths conflictivos desde git por `snapshotService.getPathsForSnapshot()`
- [x] 7.3 Reemplazar `gitService.commitOperation()` por `snapshotService.beginSnapshot() + captureFile + recordAfter + finalizeSnapshot` para el propio job de revert
- [x] 7.4 Actualizar la compensación en `PipelineTx`: en lugar de `git reset --hard`, restaurar desde snapshot previo o eliminar snapshot incompleto
- [x] 7.5 Eliminar la dependencia de `GitService` en `JobRevertService`

## 8. Eliminar GitService, GitController y GitProperties

- [x] 8.1 Eliminar `GitService.java`
- [x] 8.2 Eliminar `GitController.java`
- [x] 8.3 Eliminar `GitProperties.java` y su configuración en `application.yml`
- [x] 8.4 Eliminar `CommitDto.java` y `CommitFileStatDto.java`
- [x] 8.5 Eliminar `OperationCommitRequest.java` y `OperationCommitResult.java` (o reutilizar si siguen siendo útiles)

## 9. Frontend — adaptar a nuevos endpoints

- [x] 9.1 Actualizar `api.service.ts`: reemplazar `getGitLog()`, `getFileDiff()`, `resetToCommit()` por métodos que llaman a `/api/snapshots`
- [x] 9.2 Actualizar tipos en `types.ts`: renombrar `Commit` → `Snapshot`, `CommitFileStat` → `SnapshotFileStat` (misma forma)
- [x] 9.3 Actualizar `git-history.component.ts` para usar los nuevos métodos y tipos

## 10. Tests

- [x] 10.1 Reemplazar `GitServiceTests` por `SnapshotServiceTests` — usar directorio temporal + BD H2 en memoria
- [x] 10.2 Escribir test `captureAndRevertRestoresOriginalContent()`
- [x] 10.3 Escribir test `getDiffReturnsUnifiedDiff()`
- [x] 10.4 Reemplazar `JobRevertServiceTests` por tests actualizados sin dependencia de git
- [x] 10.5 Escribir test `cleanRevertViaSnapshotReindexes()`
- [x] 10.6 Escribir test `laterJobConflictBlocksRevert()`
