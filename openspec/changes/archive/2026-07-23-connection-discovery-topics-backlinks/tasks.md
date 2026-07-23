## 1. Búsqueda semántica por tipo

- [x] 1.1 Añadir `semanticSearchByType(float[] queryVector, String docType, int limit)` a `DocumentIndexRepository` (interfaz)
- [x] 1.2 Implementar `semanticSearchByType` en `JdbcDocumentIndexRepository` replicando `semanticSearch` con `WHERE d.doc_type = ?`
- [x] 1.3 Exponer `searchByType(String query, String docType, int limit)` en `SemanticSearchService` (con guarda de query en blanco, como `search`)

## 2. Origen `topic` en candidatos

- [x] 2.1 Añadir el valor `topic` al enum `ConnectionCandidateSource`

## 3. Paso dedicado de topics en connection discovery

- [x] 3.1 Añadir constantes `TOPIC_CONNECTION_THRESHOLD = 0.72` y `TOPIC_CONNECTION_LIMIT = 3` en `ConnectionDiscoveryService`
- [x] 3.2 Tras la búsqueda general, ejecutar `searchByType(query, "topic", TOPIC_CONNECTION_LIMIT)`, filtrando por umbral y excluyendo `sourceNotePath`
- [x] 3.3 Generar candidatos con `source = topic` usando `candidates.putIfAbsent("<targetPath>", ...)` para deduplicar contra los ya añadidos (LLM/semantic)
- [x] 3.4 Emitir progreso `connection-discovery-scan` para los topics y ajustar el cálculo de `total`

## 4. Enlace inverso (backlink) en todos los flujos

- [x] 4.1 Mover la lógica de forward links (insertar `[[targetPath]]` en la nota fuente, sección `Related`) desde `IngestPipelineService.applyForwardLinks` a `GuidedReviewService.applyAccepted`
- [x] 4.2 Derivar la nota fuente desde `proposedLink` de los candidatos aceptados y capturarla en el snapshot dentro de `applyAccepted` antes de mutarla
- [x] 4.3 Eliminar la llamada `applyForwardLinks(...)` y su captura/registro de snapshot de la nota fuente en el flujo desatendido de `IngestPipelineService`, evitando doble aplicación
- [x] 4.4 Confirmar que la revisión guiada (`GuidedReviewService.review`) ahora produce enlaces bidireccionales sin cambios adicionales

## 5. Tests

- [x] 5.1 Test unitario: `ConnectionDiscoveryService` genera candidato `topic` cuando un topic supera el umbral y no lo genera cuando no hay topics / índice vacío
- [x] 5.2 Test: no se duplica un candidato de topic ya propuesto por otro origen
- [x] 5.3 Test de pipeline (`IngestPipelineServicesTests`): en modo desatendido la nota fuente y la nota enlazada quedan enlazadas en ambos sentidos (sin regresión por mover forward links)
- [x] 5.4 Test: al aceptar un candidato en revisión guiada, la nota fuente recibe el enlace inverso
- [x] 5.5 Test de idempotencia: reaplicar una conexión existente no duplica wikilinks

## 6. Verificación

- [x] 6.1 Ejecutar la suite de tests del backend y dejarla en verde
- [x] 6.2 Verificación manual: ingestar una fuente y comprobar en el vault el enlace al topic y los backlinks en ambos modos (desatendido y validado)
