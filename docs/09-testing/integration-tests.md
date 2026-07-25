# Integration tests

Pruebas con alcance mayor detectadas:

| Test | Flujo cubierto |
|---|---|
| `IngestPipelineServicesTests` | Ingesta, source notes y pipeline. |
| `AnswerPipelineServiceTests` | Respuesta, evidencias y cleanup de artefactos. |
| `JobQueueAndEventTests` | Encolado y eventos. |
| `JobRevertServiceTests` | Reversiones por job. |
| `SnapshotServiceTests` | Historial, diffs y versiones. |
| `WebDavSyncServiceTests` | Push, pull, conflictos y resolucion. |
| `ConceptMergeJobE2ETests` | Merge de conceptos. |
| `WebIngestionTests` | Raw web frontmatter y normalizacion legacy. |

No determinado a partir del repositorio: uso de Testcontainers o base PostgreSQL real en todos los tests; se debe revisar cada test concreto antes de asumir dependencia externa.

Fuente: `backend/src/test/java/com/dpswikillm/services/*.java`.

