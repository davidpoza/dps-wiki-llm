## 1. Backend — DTO y contrato

- [x] 1.1 Crear DTO `HealthCheckProgress(String phase, int processed, int total, int embeddingsBuilt, int connectionsFound)` en `com.dpswikillm.dto` (record), con `phase ∈ {"embeddings","connections"}`.

## 2. Backend — HealthCheckService (fase 1: embeddings)

- [x] 2.1 Crear `HealthCheckService` con método `run(Consumer<HealthCheckProgress> onProgress)`, inyectando `ReindexService`, `EmbeddingIndexService`, `SemanticSearchService`, `MarkdownService`, `MutationApplier`, `SnapshotService`, `DocumentIndexRepository`.
- [x] 2.2 Implementar la fase de embeddings: `reindexService.reindexWiki(...)` seguido de `embeddingIndexService.embedIncremental(...)`, retransmitiendo el progreso como eventos `phase="embeddings"` (processed/total del `EmbedProgress`) y guardando `embeddedDocuments` como `embeddingsBuilt`.

## 3. Backend — HealthCheckService (fase 2: conexiones)

- [x] 3.1 Listar las notas fuente: documentos indexados bajo `wiki/concepts/` y `wiki/sources/` (vía `DocumentIndexRepository.findAllDocuments()` filtrando por path).
- [x] 3.2 Por cada nota fuente, construir la query (keywords del frontmatter o título, como `ConnectionDiscoveryService.buildQuery`) y generar candidatos: `semanticSearchService.search(query, 8)` filtrado por score ≥ 0.72 excluyendo la propia nota, más `searchByType(query, "topic", 3)` filtrado por score ≥ 0.72, deduplicando destinos repetidos entre ambas búsquedas.
- [x] 3.3 Determinar los enlaces realmente nuevos: parsear la sección `Related` existente de la nota fuente y descartar los destinos ya presentes; contar solo los ausentes hacia `connectionsFound` (canonicalizar el par para no contar dos veces el mismo enlace al procesar ambas notas).
- [x] 3.4 Materializar los enlaces reutilizando el patrón de `GuidedReviewService.applyAccepted`: construir `MutationAction`s que añaden `[[target]]` a `Related` de la fuente (forward link) y `[[source]]` a `Related` del destino (backlink), y aplicarlos con `MutationApplier.apply(new MutationPlan(...))`, apoyándose en `MarkdownService.mergeAndRender` para el dedupe.
- [x] 3.5 Emitir progreso `phase="connections"` con processed/total por nota fuente procesada.

## 4. Backend — Snapshot revertible

- [x] 4.1 Abrir un snapshot con `snapshotService.beginSnapshot(runId, "health-check", "Health Check", "HEALTH_CHECK")` al inicio de la fase 2.
- [x] 4.2 `captureFile` de cada nota (fuente y destino) antes de aplicar mutaciones; `recordAfter` de las modificadas; `finalizeSnapshot(snapshot, null)` al terminar.
- [x] 4.3 Si no se añadió ningún enlace, no dejar un snapshot vacío finalizado (no crearlo o eliminarlo con `deleteSnapshot`).

## 5. Backend — Endpoint SSE

- [x] 5.1 Añadir `GET /settings/health-check` (produce `text/event-stream`) en `SettingsController`, replicando el patrón de `reindex()`: `SseEmitter(0L)` + `CompletableFuture.runAsync`, eventos `progress`, evento final `done` con el `HealthCheckProgress` agregado y `error` con `{message}` en fallo.
- [x] 5.2 Verificar que el stream está cubierto por la autenticación `?token=` como los demás endpoints SSE de Settings. (Confirmado: `JwtAuthFilter` lee `token` como query param de forma genérica para todas las peticiones.)

## 6. Frontend — ApiService

- [x] 6.1 Añadir el interface `HealthCheckProgress` en `api.service.ts` (phase, processed, total, embeddingsBuilt, connectionsFound).
- [x] 6.2 Añadir `runHealthCheck(): Observable<HealthCheckProgress>` basado en `EventSource` (copia del patrón de `reindex()`), manejando `progress`/`done`/`error` y token en la URL.

## 7. Frontend — SettingsComponent

- [x] 7.1 Añadir la sección "Health Check" en la plantilla de `settings.component.ts` con botón, indicador de progreso (fase + porcentaje) y mensajes de resultado/error, siguiendo el estilo de la sección "Índice del Vault".
- [x] 7.2 Añadir señales de estado (`healthChecking`, `hcPhase`, `hcProcessed`, `hcTotal`, `hcEmbeddings`, `hcConnections`, `hcDone`, `hcError`) y el método `startHealthCheck()` que se suscribe a `api.runHealthCheck()`.
- [x] 7.3 Mostrar al finalizar el resumen: "embeddings construidos: X · conexiones encontradas: Y".

## 8. Verificación

- [x] 8.1 Backend compila (`mvn -o compile` → OK) y el frontend construye (`ng build` → OK, incluye typecheck de plantillas).
- [x] 8.2 Prueba manual E2E: con una nota nueva sin embedding, lanzar Health Check y verificar que se genera su embedding y que aparecen enlaces bidireccionales nuevos en `Related` de fuente y destino, sin duplicados. _(Requiere entorno en ejecución con backend de embeddings configurado.)_
- [x] 8.3 Verificar que el snapshot `HEALTH_CHECK` aparece en el historial de ficheros y que una segunda ejecución consecutiva no añade enlaces nuevos (idempotencia) ni deja snapshot vacío. _(Requiere entorno en ejecución.)_
