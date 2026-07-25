# Atributos de calidad

| Atributo | Mecanismo |
|---|---|
| Trazabilidad | Source notes con `source_ref`, snapshots por archivo, evidencia en respuestas. |
| Determinismo parcial | Baseline source note determinista tras salida LLM; idempotency ledger; reindex desde `wiki/**`. |
| Seguridad del filesystem | `VaultPathResolver` evita rutas absolutas y traversal. |
| Seguridad de acceso | JWT stateless, TOTP opcional, roles admin. |
| Recuperabilidad | Snapshots con contenido antes/despues y job revert. |
| Extensibilidad | Clientes `LlmClient`/`EmbeddingClient`, prompts en DB, servicios separados. |
| Operabilidad | Docker Compose, health checks, SSE de progreso. |

Limitacion transversal: la calidad semantica depende de prompts, modelo y embeddings; no hay evaluacion automatica integral.

Fuente: codigo referenciado en secciones de arquitectura, IA y datos.

