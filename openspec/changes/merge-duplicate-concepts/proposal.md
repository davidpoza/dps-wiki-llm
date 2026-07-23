## Why

La wiki acumula conceptos duplicados creados en distintos idiomas o con variantes de nombre (ej. `machine-learning.md` y `aprendizaje-automatico.md`). Aunque el sistema previene nuevos duplicados durante la ingesta, no hay mecanismo para detectar y fusionar los que ya existen. Esto genera fragmentación del conocimiento y resultados de búsqueda redundantes.

## What Changes

- Nuevo botón en la pantalla Settings: **"Find duplicate concepts"** que lanza un proceso asíncrono de escaneo.
- Modal de progreso en tiempo real vía SSE mientras se analizan todos los conceptos de la wiki.
- Al terminar el escaneo, el modal muestra una lista de grupos candidatos a fusionar, con checkboxes para selección granular.
- Cada grupo indica los ficheros a fusionar y el filename canónico resultante (singular, kebab-case, inglés).
- Al confirmar la selección, se encola un job de tipo `MERGE` que aplica las fusiones seleccionadas.
- El job MERGE es reversible: el usuario puede deshacerlo desde el historial de jobs.

## Capabilities

### New Capabilities

- `concept-dedup-scan`: Escaneo asíncrono de conceptos duplicados en toda la wiki. Emite progreso SSE. Usa embeddings semánticos + LLM judge + normalización cross-idioma para detectar grupos de conceptos que representan el mismo concepto. Devuelve grupos candidatos a merge con el filename canónico propuesto.
- `concept-merge-job`: Job de tipo MERGE que fusiona grupos de conceptos seleccionados por el usuario. Combina contenidos, actualiza backlinks, normaliza el filename canónico y registra aliases en frontmatter. Compatible con el sistema de revert de jobs existente.
- `concept-dedup-ui`: UI en la pantalla Settings para lanzar el escaneo, visualizar el progreso en modal SSE, seleccionar merges a aplicar y confirmar el job.

### Modified Capabilities

- `job-queue-and-progress`: Añadir el nuevo tipo de job `MERGE` al enum de tipos y al sistema de colas/progreso SSE.

## Impact

- **Backend**: Nuevo servicio `ConceptDedupScanService` (detección), nuevo handler `ConceptMergeJobHandler` (aplicación de merges). Nuevos endpoints REST: `POST /api/jobs/concept-dedup-scan` y el scan result (SSE reutiliza `/api/jobs/events`).
- **Frontend**: Nuevo componente modal en Settings con dos fases: progreso SSE y lista de selección.
- **Dependencies**: Reutiliza la infraestructura de embeddings (`semantic-retrieval`), LLM judge (`concept-semantic-dedup`), sistema de jobs/revert (`job-queue-and-progress`, `job-revert`).
- **Vault**: El job MERGE modifica ficheros `.md` en `wiki/concepts/` y crea un commit revertible.
- **DB**: Actualiza índice de embeddings (elimina conceptos fusionados, mantiene el canónico).
