# Ciclo de vida de datos

```mermaid
flowchart LR
  input[URL / PDF / Markdown / texto] --> raw[raw/**]
  raw --> source[wiki/sources/**]
  source --> derived[wiki/concepts|entities|analyses/**]
  derived --> index[(documents)]
  source --> index
  index --> embeddings[(document_embeddings)]
  embeddings --> answers[outputs/answer-*.md]
  source --> snapshots[(snapshots/snapshot_files)]
  derived --> snapshots
```

## Estados por tipo de dato

| Dato | Creacion | Actualizacion | Eliminacion |
|---|---|---|---|
| `raw/**` | `RawIntakeService` | Normalmente no se modifica | Puede revertirse si esta capturado en snapshot |
| `raw/health-check/**` | `HealthCheckJobController` para payload parcial | No se modifica tras encolar | No determinado a partir del repositorio |
| `wiki/sources/**` | Baseline de ingesta | Enlaces `Related` durante conexiones | Revertible por snapshot |
| `wiki/concepts/**` | Plan LLM tras guardrails o manual UI | Revision, job `HEALTH_CHECK`, merge, edicion manual | Revertible si pasa por servicios con snapshot |
| `wiki/topics/**` | Manual | Automatizacion puede actualizar si existe | No auto-create |
| `outputs/**` | Respuestas y exports de chat | No participa en indexacion wiki | Manual |
| `documents` | `ReindexService` | Reemplazo completo desde `wiki/**` | Se eliminan paths ausentes |
| `document_embeddings` | `EmbeddingIndexService` | Incremental por hash | `pruneEmbeddingsNotIn` |

Fuente: `RawIntakeService.java`, `IngestPipelineService.java`, `ReindexService.java`, `EmbeddingIndexService.java`, `AnswerPipelineService.java`, `ChatSessionVaultExportService.java`.
