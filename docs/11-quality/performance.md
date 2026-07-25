# Performance

## Decisiones existentes

- RabbitMQ usa `prefetch=1`, un consumidor y max un consumidor por listener factory. Esto reduce carreras, pero limita throughput.
- Embeddings se procesan por batch configurable (`EMBED_MAX_BATCH_SIZE`, default 8).
- `OpenAiCompatibleEmbeddingClient` trunca a 2000 caracteres.
- `AnswerPipelineService` limita contexto a 12000 caracteres.
- `ChatSessionService` limita contexto KB a 6000 caracteres e historial a 6000.
- `web-extractor` limita concurrencia con `EXTRACTOR_CONCURRENCY`, default 3.
- WebDAV sync usa mtime y ETag fast-path para evitar lecturas/descargas cuando puede.

## Riesgos

- Reindex recorre todos los markdown de `wiki/**`.
- Health-check puede hacer busquedas semanticas por nota y luego escribir multiples `Related`.
- Concept dedup batch envia todos los slugs al LLM, con timeout de 300s.
- pgvector HNSW mejora consulta, pero no elimina coste de embedding de queries.

Fuente: `RabbitConfig.java`, `EmbeddingIndexService.java`, `OpenAiCompatibleEmbeddingClient.java`, `AnswerPipelineService.java`, `ChatSessionService.java`, `web-extractor/src/config.js`, `WebDavSyncService.java`, `ConceptDedupScanService.java`.

