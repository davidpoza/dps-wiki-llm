## Why

El directorio del vault está montado vía WebDAV, lo que provoca que cualquier operación `git reset --hard` marque todos los ficheros como modificados, rompiendo el sistema de control de cambios actual. Es necesario reemplazar la implementación basada en git por un sistema propio que no dependa de operaciones del sistema de ficheros que WebDAV no gestiona correctamente.

## What Changes

- Eliminar `GitService` y su uso de git mediante `ProcessBuilder`
- Eliminar `GitController` (endpoints `/api/git/log`, `/api/git/diff`, `/api/git/reset`)
- Crear un sistema de snapshots basado en base de datos: cada operación de escritura guarda el contenido anterior y posterior de cada fichero afectado
- Reimplementar el historial de versiones consultando snapshots de la BD en lugar del log de git
- Reimplementar el diff comparando snapshots consecutivos en memoria
- Reimplementar el revert restaurando ficheros desde el snapshot anterior guardado
- Eliminar la dependencia del campo `commitRange` de `Job` para las operaciones de revert (reemplazar por referencia al snapshot ID)
- Mantener la compatibilidad con el frontend (`git-history.component.ts`) adaptando los DTOs

## Capabilities

### New Capabilities
- `snapshot-versioning`: Sistema de versiones basado en snapshots de ficheros en BD — guarda contenido before/after por operación, permite historial, diff y revert sin git

### Modified Capabilities
- (ninguna — los requisitos externos de comportamiento se mantienen iguales; solo cambia la implementación interna)

## Impact

- **Backend eliminado**: `GitService`, `GitController`, `GitProperties`, `CommitDto`, `CommitFileStatDto`
- **Backend nuevo**: entidad `Snapshot`, `SnapshotFile`, `SnapshotRepository`, `SnapshotFileRepository`, `SnapshotService`, `SnapshotController`
- **Backend modificado**: `JobRevertService` (usa `SnapshotService` en lugar de `GitService`), `Job` (campo `commitRange` reemplazado por `snapshotId`), `PipelineTx` (compensación sin git)
- **APIs**: nuevos endpoints `/api/snapshots` (lista), `/api/snapshots/{id}/diff` (diff), `/api/snapshots/{id}/revert` (hard reset), compatibles con lo que espera el frontend
- **BD**: dos tablas nuevas — `snapshots` y `snapshot_files`; migración Flyway
- **Frontend**: mínimos cambios — adaptar `git-history.component.ts` y `api.service.ts` a los nuevos endpoints/tipos
- **Tests**: reemplazar `GitServiceTests` y `JobRevertServiceTests` por tests del nuevo sistema
