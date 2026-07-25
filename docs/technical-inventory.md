# Inventario tecnico

## Aplicaciones

| Aplicacion | Tecnologia | Ruta |
|---|---|---|
| Backend API | Spring Boot 3.3, Java 21, Maven | `backend/` |
| Frontend | Angular 21, PrimeNG, Transloco, pnpm | `frontend/` |
| Extractor | Node/Fastify, Playwright, Readability, Turndown, yt-dlp, PDF parsers | `web-extractor/` |
| Infra local | Docker Compose, nginx, PostgreSQL/pgvector, RabbitMQ, TEI | `docker-compose.yml`, `docker/` |

## Procesos en segundo plano

| Proceso | Trigger | Cola/endpoint |
|---|---|---|
| INGEST | `/api/ingest`, upload, texto, Telegram `/ingest` | `wiki-write-jobs` |
| ANSWER | `/api/answer`, Telegram `/ask` o texto | `answer-jobs` |
| REVERT | `/api/jobs/{id}/revert` | `wiki-write-jobs` |
| ENRICH | `/api/jobs/enrich` | `wiki-write-jobs` |
| MERGE | `/api/concept-dedup/merge` | `wiki-write-jobs` |
| REGENERATE_KEYWORDS | `/api/keywords/regenerate` | `wiki-write-jobs` |
| RENAME | `/api/jobs/rename` | `wiki-write-jobs` |
| HEALTH_CHECK | `/api/jobs/health-check`, `/api/jobs/health-check/partial` | `wiki-write-jobs` |

## Integraciones externas

| Integracion | Codigo |
|---|---|
| LLM OpenAI-compatible | `OpenAiCompatibleLlmClient` |
| TEI embeddings | `OpenAiCompatibleEmbeddingClient` |
| Telegram | `WikiBotService`, `TelegramBotConfig` |
| WebDAV | `WebDavClient`, `WebDavSyncService` |
| Web/PDF/YouTube/NCBI | `web-extractor/src/**`, `WebExtractorClient` |

## Incertidumbres

Ver [preguntas abiertas](open-questions.md).
