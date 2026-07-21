## Context

El descubrimiento de conexiones semánticas y la generación de embeddings solo ocurren hoy dentro del pipeline de ingest (`IngestPipelineService` → `ConnectionDiscoveryService` → `GuidedReviewService.applyAccepted`), disparado al importar contenido nuevo. Las notas editadas o importadas manualmente pueden quedar sin embedding y sin las conexiones que les corresponderían. Settings ya expone dos procesos manuales asíncronos análogos —reindexado (`GET /settings/reindex`) y generación de keywords (`GET /settings/keywords/generate`)— implementados con `SseEmitter` + `EventSource`. Este cambio reutiliza ese patrón y la lógica de conexiones existente para reconciliar todo el vault a demanda.

Piezas reutilizables ya presentes:
- `ReindexService.reindexWiki(onProgress)` — reconstruye el índice de documentos desde disco.
- `EmbeddingIndexService.embedIncremental(onProgress)` — embebe los documentos sin embedding o con hash cambiado; devuelve `EmbedIndexResult(totalDocuments, embeddedDocuments)`.
- `SemanticSearchService.search(query, limit)` y `searchByType(query, "topic", limit)` — vecinos semánticos, con los umbrales usados por `ConnectionDiscoveryService` (general 0.72 / top-8, topic 0.72 / top-3).
- `GuidedReviewService.applyAccepted(...)` — patrón de materialización bidireccional: construye `MutationAction`s que añaden `[[link]]` a `Related` en la nota destino (backlink) y en la nota fuente (forward link), aplicados con `MutationApplier`.
- `MarkdownService.mergeAndRender(...)` — fusiona secciones deduplicando enlaces (`dedupeKey` + `seen`), garantizando que no se añaden enlaces repetidos.
- `SnapshotService.beginSnapshot(jobId, opType, msg, source)` / `captureFile` / `recordAfter` / `finalizeSnapshot(snapshot, null)` — snapshots revertibles con `source` personalizable y sin requerir un `Job`.

## Goals / Non-Goals

**Goals:**
- Botón en Settings que lanza un proceso asíncrono con progreso en tiempo real (porcentaje + fase) vía SSE.
- Fase 1: garantizar embeddings para todas las notas de `wiki/topics`, `wiki/concepts`, `wiki/sources`.
- Fase 2: descubrir y materializar conexiones nuevas bidireccionales entre notas de `wiki/concepts` y `wiki/sources` (con destino también a `wiki/topics`), sin duplicar enlaces.
- Registrar los cambios en un snapshot revertible (`source = "HEALTH_CHECK"`).
- Reportar al final: embeddings construidos, conexiones encontradas.

**Non-Goals:**
- No usar el LLM para proponer conexiones: la fase 2 es puramente por embeddings (a diferencia del ingest, que además usa candidatos `llm`).
- No introducir la revisión guiada: en el health check las conexiones por encima del umbral se aplican de forma desatendida.
- No encolar un `Job` en `JobQueueService` ni exponerlo en la vista de Jobs; se usa el patrón SSE directo de Settings (con snapshot para revertibilidad).
- No cambiar los umbrales ni la lógica de conexiones del pipeline de ingest.

## Decisions

### 1. Nuevo `HealthCheckService` que orquesta ambas fases

Un servicio dedicado mantiene `SettingsController` fino (igual que `ReindexService`/`KeywordGenerationService`). Expone `run(Consumer<HealthCheckProgress> onProgress)` que:

1. **Fase embeddings**: `reindexService.reindexWiki(...)` (para recoger ediciones manuales) seguido de `embeddingIndexService.embedIncremental(...)`. El progreso de embeddings se retransmite como eventos de fase `embeddings`. `embeddedDocuments` alimenta el contador "embeddings construidos".
   - _Alternativa descartada_: embeber solo los tres directorios objetivo. `embedIncremental` opera sobre todo el índice del wiki (superset que incluye los tres directorios) y ya deduplica por hash; reutilizarlo evita una consulta filtrada nueva y mantiene la consistencia global. El contador reportado es `embeddedDocuments` real.

2. **Fase conexiones**: lista las notas de `wiki/concepts` + `wiki/sources`, y por cada una genera candidatos con la misma lógica que `ConnectionDiscoveryService` (búsqueda general filtrada por umbral 0.72 y top-8 + búsqueda dedicada `searchByType("topic", 3)` con umbral 0.72), excluyendo la propia nota. Acumula, por nota fuente, el conjunto de destinos nuevos.

### 2. Materialización de enlaces reutilizando el patrón de `applyAccepted`

Para cada nota fuente con destinos nuevos se construyen `MutationAction`s: forward links (`[[target]]` en `Related` de la fuente) y backlinks (`[[source]]` en `Related` del destino), y se aplican con `MutationApplier.apply(new MutationPlan(...))`. `MarkdownService.mergeAndRender` garantiza el dedupe, por lo que "solo enlaces nuevos" se cumple a nivel de fichero.

- **Conteo de "conexiones encontradas"**: como el dedupe ocurre dentro de `mergeAndRender`, para contar solo los enlaces realmente nuevos el servicio calcula, antes de aplicar, qué destinos ya están presentes en la sección `Related` de la nota fuente (parseando el markdown existente) y cuenta solo los ausentes. Así el total reportado refleja conexiones nuevas, no candidatos.
- _Alternativa descartada_: reintroducir toda la maquinaria de `JobConnectionCandidate`/`GuidedReviewService`. Es innecesaria sin revisión guiada; se extrae/reutiliza solo la construcción de acciones bidireccionales.

### 3. Snapshot revertible sin `Job`

`SnapshotService.beginSnapshot(runId, "health-check", "Health Check", "HEALTH_CHECK")` abre un snapshot; se hace `captureFile` de cada nota que se va a modificar (fuentes y destinos) antes de aplicar, `recordAfter` de las modificadas, y `finalizeSnapshot(snapshot, null)`. La UI de historial (`getVersions`) ya muestra `source`, por lo que las versiones aparecen etiquetadas como `HEALTH_CHECK` y `hardReset(snapshotId)` permite revertir.

- Si no se añade ningún enlace, no se finaliza un snapshot vacío (se elimina o no se crea), evitando ruido en el historial.
- _Alternativa descartada_: convertirlo en un `Job` completo con `JobQueueService`. Aporta la vista de Jobs y revert por job, pero rompe el modelo simple "botón en Settings + SSE" y duplica el flujo de queue; el snapshot con `source` propio ya cubre la revertibilidad exigida.

### 4. Modelo de progreso y contrato SSE

- DTO `HealthCheckProgress(String phase, int processed, int total, int embeddingsBuilt, int connectionsFound)`.
  - `phase ∈ {"embeddings", "connections"}`.
  - `processed/total` permiten calcular el porcentaje de la fase actual en el frontend.
- Endpoint `GET /settings/health-check` (produce `text/event-stream`), idéntico en forma a `reindex()`: `CompletableFuture.runAsync`, eventos `progress`, evento final `done` con el resultado agregado, y `error` con `{message}` en fallo. Autenticado por `?token=` como los otros streams SSE de Settings.
- Frontend: `ApiService.runHealthCheck(): Observable<HealthCheckProgress>` con `EventSource` (copia del patrón de `reindex()`), y señales en `settings.component.ts` (`healthChecking`, `hcPhase`, `hcProcessed`, `hcTotal`, `hcEmbeddings`, `hcConnections`, `hcDone`, `hcError`).

## Risks / Trade-offs

- **Coste/duración en vaults grandes** (≈477 notas concepts+sources → una búsqueda semántica por nota) → Emitir progreso por nota mantiene la UI informada; el trabajo corre en un hilo async y no bloquea otras peticiones. Se acepta que la ejecución pueda durar minutos.
- **Escrituras concurrentes con un ingest en curso** → El health check reindexará y embeberá al inicio; si coincide con un ingest podría haber contención sobre ficheros. Mitigación: documentar que se ejecute en reposo; el snapshot permite revertir. (Sin lock global explícito en este alcance.)
- **Ruido de enlaces de baja relevancia** al aplicar de forma desatendida con umbral 0.72 sobre todo el vault → Se reutiliza exactamente el mismo umbral que el ingest, de modo que el resultado es coherente con lo que el pipeline habría producido; el snapshot revertible actúa como red de seguridad.
- **Doble recuento de conexiones** al procesar el par desde ambas notas → El cálculo de "nuevos" se hace contra el estado ya escrito (o contabilizando pares canónicos), evitando contar dos veces el mismo enlace.

## Migration Plan

- Cambio puramente aditivo: nuevo endpoint, servicio, DTO y sección de UI. Sin migración de esquema (los `Snapshot`/`SnapshotFile` existen; solo se usa un nuevo valor de `source`).
- Rollback: revertir el commit; los snapshots `HEALTH_CHECK` ya creados siguen siendo válidos en el historial y reversibles.

## Open Questions

- ¿Debe deshabilitarse el botón (o rechazarse el endpoint) mientras hay un ingest activo, mediante un lock global? Fuera de alcance inicial; reevaluar si se observa contención.
