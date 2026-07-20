## Why

Durante la fase de *connection discovery* del pipeline de ingest, la nota fuente se conecta con notas semánticamente similares, pero en la práctica esas conexiones caen casi siempre sobre otras notas fuente: las notas de `wiki/topics/` (hubs conceptuales curados) rara vez emergen porque compiten en el mismo top-8 y con el mismo umbral (0.72) que documentos mucho más parecidos entre sí. El resultado es que las notas nuevas quedan desconectadas de su topic principal.

Además, el enlazado bidireccional es inconsistente: en modo desatendido la nota fuente y la nota vecina se enlazan en ambos sentidos, pero en el flujo de **revisión guiada** al aceptar un candidato solo se inserta el enlace en la nota vecina (backlink hacia la fuente) y **no** el enlace inverso en la nota fuente. Se pierden enlaces según el modo de ejecución.

## What Changes

- **Paso dedicado de topics** en `ConnectionDiscoveryService`: además de la búsqueda semántica general, se ejecuta una búsqueda restringida a documentos de tipo `topic` para proponer conexiones con la(s) nota(s) de `wiki/topics/` más relevantes, con su propio umbral y cupo, de modo que no compitan contra las notas fuente.
- Nuevo valor `topic` en el enum `ConnectionCandidateSource` para distinguir el origen del candidato en la revisión y en las métricas.
- **Backlink bidireccional garantizado en todos los flujos**: cuando se crea/acepta una conexión, el enlace inverso se inserta en la nota enlazada tanto en modo desatendido como en revisión guiada. Se elimina el hueco actual donde `GuidedReviewService.review` aplica solo un sentido.
- La aplicación de los *forward links* en la nota fuente se centraliza para que sea idempotente y se ejecute una sola vez por conexión aceptada, independientemente del flujo.

## Capabilities

### New Capabilities
- `connection-discovery`: comportamiento de la fase de descubrimiento y aplicación de conexiones del pipeline de ingest — qué candidatos se generan (semánticos, LLM y topics dedicados) y cómo se materializan los enlaces bidireccionales en el vault.

### Modified Capabilities
<!-- Sin cambios de requisitos en specs existentes; term-topic-resolution cubre la resolución de términos del plan LLM, una fase distinta. -->

## Impact

- **Backend (Java):**
  - `services/ConnectionDiscoveryService` — nuevo paso de búsqueda de topics y generación de candidatos `topic`.
  - `services/SemanticSearchService` y `repositories/DocumentIndexRepository` / `JdbcDocumentIndexRepository` — nueva consulta semántica filtrada por `doc_type`.
  - `domain/ConnectionCandidateSource` — nuevo valor `topic`.
  - `services/GuidedReviewService` — aplicar el enlace inverso (forward link a la nota fuente) al aceptar candidatos.
  - `services/IngestPipelineService` — ajustar el flujo desatendido para no duplicar los forward links tras centralizarlos.
- **Datos:** los candidatos persistidos en `job_connection_candidates` pueden tener `source = 'topic'` (columna enum existente, sin migración de esquema).
- **Sin cambios de API** en contratos REST; el DTO de candidatos ya expone `source`.
- **Frontend:** opcionalmente, la vista de revisión puede mostrar el nuevo origen `topic` (no bloqueante).
