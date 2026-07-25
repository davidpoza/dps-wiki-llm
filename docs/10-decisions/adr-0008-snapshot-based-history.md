# ADR-0008: Historial y reversión por snapshots

- Estado: Inferida del codigo actual
- Fecha: 2026-07-25
- Responsables: No determinado a partir del repositorio
- Ambito: Recuperabilidad y auditoria

## Contexto

Las mutaciones tocan archivos markdown fuera de la base relacional.

## Problema

Se necesita historial por archivo, diff, versiones y posibilidad de revertir jobs sin depender exclusivamente de Git.

## Opciones consideradas

### Opcion 1

Snapshots en PostgreSQL con contenido antes/despues.

### Opcion 2

Solo Git commits.

### Opcion 3

Solo logs de eventos sin contenido.

## Decision

Guardar snapshots y snapshot_files en PostgreSQL para cambios relevantes.

## Justificacion

`SnapshotService` captura contenido antes/despues, calcula diffs y permite hard reset. `jobs.snapshot_id` enlaza jobs con snapshots.

## Consecuencias positivas

- Historial consultable por API.
- Reversiones precisas por archivo.
- Funciona aunque no haya commits Git por operacion.

## Consecuencias negativas

- Duplica contenido markdown en PostgreSQL.
- Requiere backup de DB ademas del vault.

## Riesgos

- Cambios directos al filesystem fuera de servicios quedan sin snapshot.

## Criterios para revisar esta decision

- Si se reintroduce Git como fuente primaria de historial con guarantees equivalentes.

## Referencias al codigo

- `backend/src/main/java/com/dpswikillm/services/SnapshotService.java`
- `backend/src/main/resources/db/migration/V13__snapshots.sql`
- `backend/src/main/resources/db/migration/V14__snapshot_files.sql`
- `backend/src/main/java/com/dpswikillm/services/JobRevertService.java`

