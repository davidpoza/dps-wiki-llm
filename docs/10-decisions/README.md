# Architecture Decision Records

Los ADR registran decisiones arquitectonicas reales o claramente inferibles del codigo actual. Cuando el repositorio no contiene la motivacion historica, el ADR lo indica en `Estado`.

| ADR | Decision |
|---|---|
| [ADR-0001](adr-0001-spring-boot-angular-stack.md) | Spring Boot + Angular como stack principal |
| [ADR-0002](adr-0002-vault-raw-wiki-separation.md) | Separacion estricta `raw/**` y `wiki/**` |
| [ADR-0003](adr-0003-rabbitmq-job-queues.md) | RabbitMQ con colas separadas para escritura y respuesta |
| [ADR-0004](adr-0004-postgresql-pgvector-index.md) | PostgreSQL con pgvector/pg_trgm para indices |
| [ADR-0005](adr-0005-openai-compatible-llm.md) | Integracion LLM OpenAI-compatible |
| [ADR-0006](adr-0006-tei-embeddings-sidecar.md) | TEI sidecar para embeddings |
| [ADR-0007](adr-0007-jwt-totp-security.md) | JWT stateless con TOTP opcional |
| [ADR-0008](adr-0008-snapshot-based-history.md) | Historial y reversión por snapshots |
| [ADR-0009](adr-0009-browser-web-extractor.md) | Microservicio browser-based para extraccion web |
| [ADR-0010](adr-0010-prompts-in-database.md) | Prompts editables en base de datos |

