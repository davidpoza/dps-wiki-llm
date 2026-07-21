## Why

El vault puede quedar en un estado inconsistente respecto al pipeline de ingest: notas editadas o importadas manualmente sin embedding, y conexiones semánticas entre notas que nunca se materializaron porque solo se calculan al ingestar contenido nuevo. No existe forma de reconciliar todo el vault a demanda. Se necesita una acción manual que ejecute el mismo descubrimiento de conexiones del ingest, pero sobre todas las notas, para garantizar consistencia.

## What Changes

- Nueva sección **"Health Check"** en la pantalla de Settings, con un botón para lanzar un proceso asíncrono y una barra/indicador de progreso en tiempo real vía SSE (porcentaje + fase actual).
- El proceso ejecuta dos fases secuenciales:
  1. **Embeddings**: recorre todas las notas de `wiki/topics`, `wiki/concepts` y `wiki/sources` y genera el embedding de las que aún no lo tienen (o cuyo contenido cambió).
  2. **Conexiones**: recorre todas las notas de `wiki/concepts` y `wiki/sources`, busca vecinos semánticos (búsqueda general + búsqueda dedicada de `topic`) y añade **solo los enlaces nuevos** a la sección `Related`, materializando enlace directo y su backlink (enlace inverso) de forma bidireccional, sin duplicar enlaces existentes.
- Todos los cambios de la fase 2 se envuelven en un **snapshot revertible** (`source = "HEALTH_CHECK"`), de modo que la ejecución queda registrada en el historial de ficheros y es reversible.
- Al finalizar, el proceso informa de: **embeddings construidos** y **enlaces (conexiones) encontrados**.
- Nuevo endpoint backend SSE `GET /settings/health-check` que emite eventos `progress` / `done` / `error`.

## Capabilities

### New Capabilities
- `vault-health-check`: Acción manual desde Settings que reconcilia el vault completo — genera embeddings faltantes y descubre/materializa conexiones bidireccionales nuevas entre notas usando embeddings — con progreso en tiempo real vía SSE y resultado agregado (embeddings construidos, enlaces encontrados).

### Modified Capabilities
<!-- Ninguna: no existe spec promovido en openspec/specs/ que cubra el descubrimiento de conexiones o el reindexado; el comportamiento reutilizado (ConnectionDiscoveryService, EmbeddingIndexService) vive solo en código y en deltas de cambios previos. -->

## Impact

- **Backend (Java):**
  - Nuevo `HealthCheckService` que orquesta las dos fases reutilizando `ReindexService`, `EmbeddingIndexService.embedIncremental`, `SemanticSearchService` (`search` + `searchByType`), `MutationApplier`/`MarkdownService.mergeAndRender` (para dedupe de enlaces) y `SnapshotService`.
  - Nuevo endpoint SSE en `SettingsController` (`GET /settings/health-check`) siguiendo el patrón existente de `reindex` / `keywords/generate`.
  - Nuevo DTO `HealthCheckProgress` (fase, procesados, total, embeddings construidos, enlaces encontrados).
- **Frontend (Angular):**
  - `settings.component.ts`: nueva sección "Health Check" con señales de estado y progreso.
  - `api.service.ts`: nuevo método `runHealthCheck()` basado en `EventSource` (mismo patrón que `reindex()` / `generateKeywords()`), y nuevo interface `HealthCheckProgress`.
- **Datos:** los cambios en notas quedan registrados como `SnapshotFile` bajo un `Snapshot` con `source = "HEALTH_CHECK"` (sin migración de esquema).
- **Sin breaking changes**: no cambia el contrato de la API de ingest ni la lógica de descubrimiento de conexiones existente; solo se expone una nueva ejecución manual sobre todo el vault.
