# Servicios backend

| Servicio | Responsabilidad |
|---|---|
| `RawIntakeService` | Escribe URL/PDF/Markdown/texto en `raw/**`. |
| `WebExtractorClient` | Cliente HTTP para `web-extractor`. |
| `SourceNormalizer` | Convierte `raw/**` en `NormalizedSourcePayload`. |
| `SourceNoteLlmService` | Genera source note estructurada via LLM. |
| `SourceNotePlanner` | Crea plan baseline determinista para `wiki/sources/**`. |
| `LlmMutationPlanService` | Solicita plan opcional de conceptos al LLM. |
| `MutationGuardrailService` | Valida rutas, topics, idempotencia y fuentes. |
| `ConceptResolutionService` | Reescribe creates de conceptos a updates cuando detecta duplicados. |
| `MutationApplier` | Fusiona frontmatter/secciones y escribe markdown. |
| `ReindexService` | Reconstruye `documents` desde `wiki/**`. |
| `EmbeddingIndexService` | Genera embeddings incrementales. |
| `SemanticSearchService` | Recuperacion top-k por pgvector. |
| `ConnectionDiscoveryService` | Persiste candidatos LLM/semantic/topic. |
| `GuidedReviewService` | Aplica candidatos aceptados y enlaces bidireccionales. |
| `AnswerPipelineService` | Recupera contexto, llama LLM y escribe `outputs/answer-*.md`. |
| `ChatSessionService` | Chat persistido por usuario con contexto semantico. |
| `FileService` | CRUD del vault, imagenes y PDF. |
| `SnapshotService` | Historial, versiones, diffs y hard reset. |
| `WebDavSyncService` | Replica y reconciliacion WebDAV. |
| `HealthCheckService` | Reindex+embeddings+materializacion de Related por semantic search. |
| `KeywordGenerationService` | Keywords faltantes en concepts/sources. |
| `ConceptDedupScanService` | Deteccion batch de conceptos duplicados con LLM. |

Fuente: `backend/src/main/java/com/dpswikillm/services/*.java`.

