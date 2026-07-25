# Vision del proyecto

`dps-wiki-llm` es un sistema de mantenimiento de conocimiento persistente. Su objetivo no es ser solo un chatbot con memoria, sino convertir entradas crudas en notas markdown duraderas, indexadas y reutilizables.

La regla central es separar eventos de entrada y estado curado:

```text
raw/**  -> entradas y artefactos recibidos
wiki/** -> conocimiento derivado, estable y enlazado
```

El backend Spring Boot orquesta ingesta, revision, busqueda semantica, respuestas y mantenimiento. El frontend Angular ofrece las pantallas de ingesta, chat, revision, explorador del vault, historial, configuracion y perfil. Un microservicio Node/Fastify con Playwright extrae contenido web, PDF, PubMed/PMC y transcripciones de YouTube a markdown estructurado.

## Capacidades principales

| Capacidad | Implementacion |
|---|---|
| Ingesta de URL | `JobController`, `RawIntakeService`, `WebExtractorClient`, `web-extractor/src/server.js` |
| Ingesta de Markdown/PDF | `RawIntakeService.ingestFile`, `POST /extract/file` en `web-extractor` |
| Creacion de notas fuente | `SourceNoteLlmService`, `SourceNotePlanner`, `MutationApplier` |
| Planes de conceptos/enlaces con IA | `LlmMutationPlanService`, `ConceptResolutionService`, `ConnectionDiscoveryService` |
| Revision guiada | `GuidedReviewService`, `JobStatus.AWAITING_REVIEW`, `ReviewComponent` |
| Respuestas con recuperacion semantica | `AnswerPipelineService`, `SemanticSearchService`, `OpenAiCompatibleEmbeddingClient` |
| Edicion del vault | `FileController`, `FileService`, `ExplorerComponent` |
| Versionado por snapshot | `SnapshotService`, tablas `snapshots` y `snapshot_files` |
| Sincronizacion WebDAV | `WebDavSyncService`, `WebDavClient`, `WebDavController` |
| Autenticacion | `SecurityConfig`, `JwtAuthFilter`, `AuthController`, `TotpService` |

## Que no hace

- No ejecuta agentes libres que modifiquen el vault sin reglas.
- No indexa `raw/**` como fuente de respuesta directa; la indexacion principal se reconstruye desde `wiki/**`.
- No crea temas automaticamente bajo `wiki/topics/**`.
- No tiene un scheduler Spring para mantenimiento periodico. La documentacion de mantenimiento describe endpoints manuales existentes.

Fuente: `AGENTS.md`, `README.md`, `backend/src/main/java/com/dpswikillm/services/IngestPipelineService.java`, `backend/src/main/java/com/dpswikillm/services/ReindexService.java`.

