# Configuracion backend

La configuracion se enlaza desde `AppProperties` con prefijo `app`.

| Propiedad/env | Uso |
|---|---|
| `VAULT_PATH` / `app.vault-path` | Root del vault. |
| `CORS_ALLOWED_ORIGINS` | Origenes permitidos. |
| `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` | Cliente chat OpenAI-compatible. |
| `EMBED_BASE_URL`, `EMBED_MODEL`, `EMBED_API_KEY`, `EMBED_DIMENSION`, `EMBED_MAX_BATCH_SIZE` | Embeddings TEI. |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_CHAT_ID` | Bot long polling opcional. |
| `JWT_SECRET`, `JWT_EXPIRATION_MS` | JWT. |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Seed inicial de admin. |
| `EXTRACTOR_BASE_URL`, `EXTRACTOR_TIMEOUT` | Microservicio extractor. |
| `WEBDAV_URL`, `WEBDAV_USERNAME`, `WEBDAV_PASSWORD` | WebDAV opcional. |
| `LOG_LEVEL` | Nivel root de logging. |

Fuente: `application.yml`, `.env.sample`, `AppProperties.java`, `docker-compose.yml`.

