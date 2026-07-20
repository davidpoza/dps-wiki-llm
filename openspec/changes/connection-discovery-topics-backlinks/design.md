## Context

La fase de *connection discovery* vive en `ConnectionDiscoveryService.discoverAndPersist(...)`, que combina dos fuentes de candidatos:

1. **Plan LLM opcional** (`MutationPlan`): acciones `update` sobre rutas concretas → candidatos con `source = llm`.
2. **Búsqueda semántica** (`SemanticSearchService.search`) sobre todo `wiki/` con `DEFAULT_THRESHOLD = 0.72` y `DEFAULT_NEIGHBOR_LIMIT = 8` → candidatos con `source = semantic`.

Cada candidato guarda `targetPath` (la nota que se editará) y `proposedLink` (la nota fuente que se inserta). La materialización actual:

- `GuidedReviewService.applyAccepted(...)` inserta `[[proposedLink]]` (= nota fuente) en `targetPath` → sentido **vecina → fuente**.
- `IngestPipelineService.applyForwardLinks(...)` inserta `[[targetPath]]` (= vecina) en la nota fuente → sentido **fuente → vecina**.

En **modo desatendido** el pipeline llama a ambos, por lo que el enlace es bidireccional. En **modo validado**, `GuidedReviewService.review(...)` llama solo a `applyAccepted(...)` y nunca a `applyForwardLinks(...)`: se pierde el sentido fuente → vecina.

El índice (`documents`) ya guarda `doc_type`, que para topics vale `topic` (frontmatter `type: "topic"` o inferido de la ruta `wiki/topics/`). `JdbcDocumentIndexRepository.semanticSearch` no filtra por tipo.

## Goals / Non-Goals

**Goals:**
- Que las notas de `wiki/topics/` se propongan como conexiones de forma fiable mediante un paso dedicado, sin competir contra las notas fuente en el mismo top-N.
- Garantizar enlace bidireccional (directo + inverso) en modo desatendido y en revisión guiada.
- Mantener idempotencia: reaplicar no duplica enlaces.

**Non-Goals:**
- No se cambia la resolución de términos del plan LLM (`term-topic-resolution`) ni la creación de concepts/topics.
- No se crean topics automáticamente (sigue prohibido por specs existentes).
- No se rediseña el modelo de datos de `job_connection_candidates` (se reutiliza la columna `source`).
- No se cambia el contrato REST.

## Decisions

### 1. Paso dedicado de topics vía consulta semántica filtrada por `doc_type`
Se añade a `DocumentIndexRepository` un método `semanticSearchByType(float[] queryVector, String docType, int limit)` que replica `semanticSearch` con un `WHERE d.doc_type = ?`. `SemanticSearchService` expone `searchByType(query, docType, limit)`.

En `ConnectionDiscoveryService` se ejecuta, tras la búsqueda general, una búsqueda `searchByType(query, "topic", TOPIC_CONNECTION_LIMIT)` filtrada por `TOPIC_CONNECTION_THRESHOLD`, excluyendo la propia nota fuente. Constantes nuevas: `TOPIC_CONNECTION_THRESHOLD = 0.72`, `TOPIC_CONNECTION_LIMIT = 3`.

**Por qué** una consulta filtrada y no post-filtrar los resultados generales: el top-8 general se llena de notas fuente muy similares entre sí y los topics (notas largas y genéricas) casi nunca entran; filtrar en SQL por `doc_type` garantiza que evaluamos los topics más cercanos por sí mismos. Alternativa descartada: subir `DEFAULT_NEIGHBOR_LIMIT` — aumentaría ruido y coste sin garantizar topics.

Los candidatos de topics se deduplican contra los ya añadidos (misma clave `targetPath`) para no colisionar con un topic ya propuesto por el plan LLM o la búsqueda general.

### 2. Nuevo valor `topic` en `ConnectionCandidateSource`
Se añade `topic` al enum. La columna es `EnumType.STRING`, sin migración de esquema. Permite distinguir el origen en la revisión y en métricas/log.

### 3. Centralizar el enlace inverso para cubrir todos los flujos
Se mueve la lógica de *forward links* (insertar `[[targetPath]]` en la nota fuente) a `GuidedReviewService.applyAccepted(...)`, que es el único punto por el que pasan **ambos** flujos (desatendido invoca `applyAccepted` con `commitImmediately=false`; la revisión guiada lo invoca con `commitImmediately=true`). Así:

- La nota fuente se deriva de `proposedLink` de los candidatos aceptados (ya se usa así en `review`).
- Dentro de `applyAccepted` se construye, además de las acciones vecina → fuente, una acción `update` sobre la nota fuente con la sección `Related` conteniendo `[[targetPath]]` de cada candidato aceptado (idempotente por sección).
- Se captura la nota fuente en el snapshot antes de mutarla.
- Se **elimina** la llamada separada `applyForwardLinks(...)` de `IngestPipelineService` para no duplicar el trabajo (y su captura de snapshot de la nota fuente pasa a `applyAccepted`).

**Por qué** centralizar en `applyAccepted` en vez de añadir la llamada a `review`: evita divergencia futura y garantiza que cualquier consumidor de `applyAccepted` obtenga el comportamiento bidireccional. Alternativa descartada: duplicar `applyForwardLinks` en `review` — deja dos rutas que hay que mantener sincronizadas.

### 4. Idempotencia
La inserción de secciones en `MutationApplier` ya es no destructiva (merge de secciones). La deduplicación de wikilinks dentro de la sección `Related`/`Sources` debe evitar duplicados al reaplicar; se apoya en la clave de idempotencia por acción (`forward-links:` / `review:...`) y en el merge de secciones existente. Se verifica con un test de reaplicación.

## Risks / Trade-offs

- [Un `TOPIC_CONNECTION_THRESHOLD` demasiado bajo enlaza topics poco relevantes] → default igual al general (0.72) y cupo pequeño (3); ambos configurables como constantes para ajustar tras observar resultados reales.
- [Mover forward links a `applyAccepted` cambia el comportamiento del modo desatendido] → cubierto por tests de pipeline existentes (`IngestPipelineServicesTests`) y uno nuevo que verifica bidireccionalidad en ambos modos; se elimina la doble aplicación con cuidado del snapshot de la nota fuente.
- [Doble captura/registro del snapshot de la nota fuente si se centraliza mal] → capturar la nota fuente una sola vez dentro de `applyAccepted` y ajustar `IngestPipelineService` para no recapturarla por su cuenta.
- [La consulta por tipo añade una llamada extra de embeddings/DB por ingest] → coste marginal (una query vectorial adicional con `LIMIT 3`).

## Migration Plan

1. Añadir `topic` al enum y el método de repositorio + servicio de búsqueda por tipo.
2. Añadir el paso dedicado de topics en `ConnectionDiscoveryService`.
3. Centralizar forward links en `applyAccepted` y quitar la llamada duplicada del pipeline.
4. Tests (unitarios + pipeline) y verificación manual de un ingest en ambos modos.

Rollback: revertir el commit; no hay migración de datos ni cambios de esquema, por lo que los candidatos `topic` ya persistidos siguen siendo válidos como strings.

## Open Questions

- ¿La sección destino para el enlace del topic debe ser `Related` (como el resto) o una sección específica como `Topics`? Por defecto se usa `Related` para no fragmentar; ajustable si se prefiere separar visualmente en las notas.
