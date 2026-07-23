## Context

El vault está montado vía WebDAV. Git gestiona su índice basándose en metadatos del sistema de ficheros (inodos, timestamps) que WebDAV no preserva fielmente. Cuando se ejecuta `git reset --hard` o `git revert`, WebDAV responde con timestamps actualizados para todos los ficheros que transfiere, haciendo que git los marque como modificados. Esto corrompe el estado del repositorio y hace inútil el sistema de control de cambios.

La solución es eliminar git completamente y almacenar snapshots de ficheros directamente en la base de datos PostgreSQL (ya existente en el proyecto), que sí es transaccional y no tiene dependencias del sistema de ficheros subyacente.

**Estado actual:**
- `GitService` — llama a git CLI via `ProcessBuilder` para log, diff, reset, revert y commit
- `JobRevertService` — orquesta reverts usando `GitService`, guarda el rango `commitRange` en `Job`
- `GitController` — expone `/api/git/log`, `/api/git/diff`, `/api/git/reset`
- `Job.commitRange` — almacena el rango SHA de git asociado a cada operación

## Goals / Non-Goals

**Goals:**
- Eliminar toda dependencia de git en tiempo de ejecución
- Mantener las capacidades: historial de operaciones, diff de ficheros por operación, revert de una operación concreta
- Mantener la lógica de detección de conflictos entre jobs (no tocar los mismos ficheros)
- Compatible con WebDAV — solo leer/escribir ficheros, nunca comandos git
- Mantener compatibilidad con el frontend existente (adaptando DTOs, no rehaciendo la UI)

**Non-Goals:**
- Historial de versiones a nivel de commit atómico (el nuevo sistema trabaja a nivel de operación/job, igual que antes)
- Branching, merging, o cualquier otra función de SCM
- Migrar el historial de git existente al nuevo sistema (los snapshots empiezan desde cero)
- Eliminar el repositorio git físico del disco (puede dejarse, solo se deja de usar)

## Decisions

### 1. Almacenamiento en PostgreSQL (no en ficheros separados)

**Opción elegida**: Tablas `snapshots` y `snapshot_files` en PostgreSQL, con el contenido de los ficheros en columnas `TEXT`.

**Alternativas consideradas**:
- *Directorio de backup separado fuera de WebDAV*: solucionaría el problema de WebDAV pero introduciría dependencia del sistema de ficheros del host, complejidad en la gestión de paths y ausencia de transaccionalidad.
- *Almacén de objetos (S3/MinIO)*: excesivamente complejo para las necesidades actuales.

**Rationale**: La BD ya existe, es transaccional, y los ficheros markdown del vault son texto pequeño. Postgres maneja bien TEXT de hasta varios MB por fila.

### 2. Esquema de snapshots

```
snapshots
  id            UUID PRIMARY KEY
  job_id        VARCHAR (FK a jobs, nullable para operaciones manuales)
  operation_type VARCHAR NOT NULL   -- "ingest", "job-revert", "manual-reset", etc.
  message       TEXT
  created_at    TIMESTAMP NOT NULL

snapshot_files
  id            UUID PRIMARY KEY
  snapshot_id   UUID REFERENCES snapshots(id)
  path          VARCHAR NOT NULL    -- ruta relativa desde vault root
  content_before TEXT              -- NULL si el fichero era nuevo
  content_after  TEXT              -- NULL si el fichero fue eliminado
```

**Rationale**: Guardar `content_before` y `content_after` permite:
- Hacer diff en memoria sin acceder al disco
- Revert exacto a `content_before` sin necesidad de historial de snapshots anteriores
- Detectar conflictos comprobando solapamiento de paths entre jobs

### 3. Captura del snapshot: before-write

Antes de que cualquier job escriba un fichero, `SnapshotService.captureFile(path)` lee y almacena el contenido actual (`content_before`). Tras la escritura, `SnapshotService.recordAfter(path)` guarda `content_after`. El snapshot se finaliza cuando el job completa.

**Alternativa considerada**: snapshot solo del estado "after" y calcular "before" como el "after" del snapshot anterior. Descartado porque requiere recorrer toda la cadena de snapshots para un revert.

### 4. Diff generado en memoria con `java-diff-utils`

La librería `io.github.java-diff-utils:java-diff-utils` (licencia Apache 2.0, sin dependencias transitivas) genera diffs unificados en memoria comparando `content_before` y `content_after` de cada `SnapshotFile`. No hay llamada a git ni al sistema de ficheros.

### 5. Revert: restaurar `content_before` directamente al disco

`SnapshotService.revert(snapshotId)` escribe `content_before` de cada `SnapshotFile` del snapshot indicado en el vault. Si `content_before` es NULL el fichero se elimina (era nuevo). No hay comandos git.

La lógica de detección de conflictos existente en `JobRevertService` se mantiene igual, pero ahora consulta `snapshot_files.path` en lugar de `git diff --name-only`.

### 6. Compatibilidad de API: nuevos endpoints bajo `/api/snapshots`

Los endpoints de git actuales se reemplazan:

| Antiguo | Nuevo |
|---|---|
| `GET /api/git/log?limit=N` | `GET /api/snapshots?limit=N` |
| `GET /api/git/diff?sha=X&path=Y` | `GET /api/snapshots/{id}/diff?path=Y` |
| `POST /api/git/reset` | `POST /api/snapshots/{id}/reset` |

El frontend se actualiza para usar los nuevos endpoints. Los DTOs se renombran pero mantienen estructura compatible.

### 7. Job.commitRange → Job.snapshotId

El campo `commitRange` (string SHA de git) se reemplaza por `snapshotId` (UUID). Se añade columna `snapshot_id` a la tabla `jobs` con migración Flyway; `commit_range` se deja como nullable para compatibilidad histórica y se depreca.

## Risks / Trade-offs

- **Tamaño de BD**: Guardar contenido completo de ficheros aumenta el tamaño de la BD. Mitigación: los ficheros markdown del vault son pequeños (típicamente <100KB); se puede añadir retención de snapshots (borrar los más antiguos de N días) como mejora futura.
- **Sin historial pre-migración**: El historial de git previo no se migra. Mitigación: es aceptable — el historial antiguo sigue visible en git si el usuario lo necesita directamente.
- **Cobertura de tests**: Los tests actuales de `GitService` y `JobRevertService` usan repos git temporales. Hay que reemplazarlos. Mitigación: los nuevos tests son más simples — trabajan con ficheros en directorio temporal y BD H2 en memoria.
- **PipelineTx**: La compensación actual registra `git reset --hard` como rollback. Hay que reemplazarla por restauración desde snapshot (o simplemente borrar el snapshot incompleto de BD). Mitigación: la nueva compensación es más fiable — no depende del estado del sistema de ficheros.

## Migration Plan

1. Añadir tablas `snapshots` y `snapshot_files` vía Flyway (non-destructive)
2. Añadir columna `snapshot_id` a `jobs` (nullable) vía Flyway
3. Implementar `SnapshotService` y `SnapshotController`
4. Refactorizar `JobRevertService` para usar `SnapshotService`
5. Refactorizar todos los jobs de escritura (ingest, etc.) para capturar snapshots
6. Actualizar frontend (`git-history.component.ts`, `api.service.ts`)
7. Eliminar `GitService`, `GitController`, `GitProperties`
8. Desplegar — no requiere downtime (tablas nuevas, columna nullable)

**Rollback**: Si hay problemas, reintroducir `GitService` y restaurar endpoints de git. Las tablas nuevas se pueden dejar (no interfieren).

## Open Questions

- ¿Se desea retención automática de snapshots (borrar snapshots más antiguos de N días)? Por ahora no se implementa, se deja como mejora futura.
- ¿Los jobs de tipo ANSWER también deben capturar snapshot? En principio no escriben ficheros en el vault, pero conviene confirmarlo.
